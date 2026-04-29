const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");

const host = "127.0.0.1";
const appPort = Number(process.env.PORT || 5173);
const rocketLeaguePort = Number(process.env.RL_STATS_PORT || 49123);
const root = path.resolve(__dirname);
const statePath = path.join(root, "overlay-state.json");

const rlClients = new Set();
const overlayStateClients = new Set();

let rlSocket = null;
let rlBuffer = "";
let reconnectTimer = null;

const defaultOverlayState = {
  meta: {
    matchTitle: "",
    blueName: "",
    orangeName: "",
    seriesLength: 5,
    blueSeriesWins: 0,
    orangeSeriesWins: 0,
    viewMode: "basic",
    focusedPlayerId: "",
  },
  modules: [
    { id: "scoreboard", type: "scoreboard", x: 440, y: 54, w: 720, h: 105, visible: true },
    { id: "ball-speed", type: "ballSpeed", x: 1360, y: 760, w: 210, h: 92, visible: true },
    {
      id: "blue-roster",
      type: "roster",
      x: 18,
      y: 54,
      w: 320,
      h: 118,
      visible: true,
      settings: { team: 0 },
    },
    {
      id: "orange-roster",
      type: "roster",
      x: 1262,
      y: 54,
      w: 320,
      h: 118,
      visible: true,
      settings: { team: 1 },
    },
    { id: "team-totals", type: "teamTotals", x: 190, y: 748, w: 1220, h: 74, visible: false },
    { id: "focus-player", type: "focusedPlayer", x: 24, y: 828, w: 640, h: 54, visible: false },
  ],
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultOverlayState));
}

function readOverlayState() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const defaultState = cloneDefaultState();
    return {
      ...defaultState,
      ...saved,
      meta: { ...defaultState.meta, ...(saved.meta || {}) },
    };
  } catch {
    return cloneDefaultState();
  }
}

function writeOverlayState(state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendFile(response, requestPath) {
  const urlPath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(urlPath);
  const filePath = path.resolve(root, `.${decodedPath}`);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

function createWebSocketAccept(key) {
  return crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function frameWebSocketMessage(payload) {
  const body = Buffer.from(payload);
  const length = body.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), body]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, body]);
}

function broadcastTo(clients, message) {
  const frame = frameWebSocketMessage(JSON.stringify(message));

  for (const client of clients) {
    if (!client.destroyed) {
      client.write(frame);
    }
  }
}

function normalizeMessage(message) {
  if (typeof message.Data === "string") {
    try {
      return { ...message, Data: JSON.parse(message.Data) };
    } catch {
      return message;
    }
  }

  return message;
}

function consumeRocketLeagueBuffer() {
  for (;;) {
    const start = rlBuffer.indexOf("{");

    if (start === -1) {
      rlBuffer = "";
      return;
    }

    if (start > 0) {
      rlBuffer = rlBuffer.slice(start);
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let index = 0; index < rlBuffer.length; index += 1) {
      const char = rlBuffer[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end === -1) {
      return;
    }

    const chunk = rlBuffer.slice(0, end);
    rlBuffer = rlBuffer.slice(end);

    try {
      broadcastTo(rlClients, normalizeMessage(JSON.parse(chunk)));
    } catch {
      // Keep the bridge resilient if Rocket League emits a partial or malformed packet.
    }
  }
}

function scheduleRocketLeagueReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRocketLeague();
  }, 1200);
}

function connectRocketLeague() {
  if (rlSocket && !rlSocket.destroyed) {
    return;
  }

  rlSocket = net.connect(rocketLeaguePort, host);

  rlSocket.on("connect", () => {
    rlBuffer = "";
    broadcastTo(rlClients, { Event: "BridgeStatus", Data: { Status: "RocketLeagueConnected" } });
  });

  rlSocket.on("data", (data) => {
    rlBuffer += data.toString("utf8");
    consumeRocketLeagueBuffer();
  });

  rlSocket.on("close", () => {
    broadcastTo(rlClients, { Event: "BridgeStatus", Data: { Status: "RocketLeagueDisconnected" } });
    scheduleRocketLeagueReconnect();
  });

  rlSocket.on("error", () => {
    broadcastTo(rlClients, { Event: "BridgeStatus", Data: { Status: "RocketLeagueUnavailable" } });
  });
}

async function handleApiRequest(request, response, pathname) {
  if (pathname === "/api/overlay-state" && request.method === "GET") {
    sendJson(response, 200, readOverlayState());
    return true;
  }

  if (pathname === "/api/overlay-state" && request.method === "POST") {
    try {
      const nextState = await readRequestJson(request);
      writeOverlayState(nextState);
      broadcastTo(overlayStateClients, { type: "overlayState", state: nextState });
      sendJson(response, 200, nextState);
    } catch {
      sendJson(response, 400, { error: "Invalid overlay state JSON" });
    }
    return true;
  }

  if (pathname === "/api/overlay-state/reset" && request.method === "POST") {
    const nextState = cloneDefaultState();
    writeOverlayState(nextState);
    broadcastTo(overlayStateClients, { type: "overlayState", state: nextState });
    sendJson(response, 200, nextState);
    return true;
  }

  if (pathname === "/api/output-refresh" && request.method === "POST") {
    broadcastTo(overlayStateClients, { type: "outputRefresh" });
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${host}:${appPort}`);

  if (await handleApiRequest(request, response, pathname)) {
    return;
  }

  sendFile(response, pathname);
});

server.on("upgrade", (request, socket) => {
  const { pathname } = new URL(request.url, `http://${host}:${appPort}`);

  if (pathname !== "/rl" && pathname !== "/overlay-state") {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];

  if (!key) {
    socket.destroy();
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      "",
      "",
    ].join("\r\n"),
  );

  const clients = pathname === "/rl" ? rlClients : overlayStateClients;
  clients.add(socket);

  if (pathname === "/overlay-state") {
    socket.write(frameWebSocketMessage(JSON.stringify({ type: "overlayState", state: readOverlayState() })));
  }

  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("data", () => {});
});

server.listen(appPort, host, () => {
  console.log(`Broadcast studio: http://${host}:${appPort}`);
  console.log(`Producer panel: http://${host}:${appPort}/studio.html`);
  console.log(`OBS output: http://${host}:${appPort}/output.html`);
  console.log(`Rocket League Stats API TCP: ${host}:${rocketLeaguePort}`);
  connectRocketLeague();
});
