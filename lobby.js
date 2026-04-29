const params = new URLSearchParams(window.location.search);
const state = {
  socket: null,
  players: new Map(),
  ratings: new Map(),
  reconnectDelayMs: 1200,
};

const elements = {
  status: document.querySelector("#status"),
  statusText: document.querySelector("#statusText"),
  bluePlayers: document.querySelector("#bluePlayers"),
  orangePlayers: document.querySelector("#orangePlayers"),
  note: document.querySelector("#note"),
};

function socketUrl() {
  const explicitSocket = params.get("socket");

  if (explicitSocket) {
    return explicitSocket;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/rl`;
  }

  return "ws://127.0.0.1:5173/rl";
}

function setStatus(status, text) {
  elements.status.dataset.status = status;
  elements.statusText.textContent = text;
}

function normalizeRatingKey(value) {
  return String(value || "").trim().toLowerCase();
}

function addRating(key, value) {
  const normalized = normalizeRatingKey(key);

  if (normalized) {
    state.ratings.set(normalized, value);
  }
}

async function loadRatings() {
  try {
    const response = await fetch(params.get("ratings") || "./mmr.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No ratings file");
    }

    const data = await response.json();
    const entries = Array.isArray(data) ? data : Object.entries(data);

    for (const entry of entries) {
      if (Array.isArray(entry)) {
        addRating(entry[0], entry[1]);
      } else {
        addRating(entry.primaryId || entry.name || entry.id, entry);
      }
    }

    elements.note.textContent = `Loaded ${state.ratings.size} local rating entries from mmr.json.`;
  } catch {
    elements.note.innerHTML =
      'MMR is not exposed by the official Stats API. Add <code>mmr.json</code> to show known ratings.';
  }
}

function getRating(player) {
  const candidates = [
    player.PrimaryId,
    player.Name,
    player.PrimaryId?.replace(/\|0$/, ""),
  ];

  for (const candidate of candidates) {
    const match = state.ratings.get(normalizeRatingKey(candidate));

    if (match) {
      return match;
    }
  }

  return null;
}

function playerKey(player) {
  return [player.TeamNum, player.Shortcut, player.PrimaryId, player.Name].filter(Boolean).join(":");
}

function formatRating(rating) {
  if (!rating) {
    return "N/A";
  }

  if (typeof rating === "number") {
    return Math.round(rating).toString();
  }

  if (typeof rating === "string") {
    return rating;
  }

  if (Number.isFinite(rating.mmr)) {
    return Math.round(rating.mmr).toString();
  }

  if (Number.isFinite(rating.rating)) {
    return Math.round(rating.rating).toString();
  }

  return rating.rank || "N/A";
}

function formatSubRating(rating) {
  if (!rating || typeof rating !== "object") {
    return "No rating source";
  }

  return [rating.rank, rating.playlist].filter(Boolean).join(" - ") || "Local rating";
}

function playerCard(player) {
  const rating = getRating(player);
  const formattedRating = formatRating(rating);
  const article = document.createElement("article");
  article.className = "player";

  const top = document.createElement("div");
  top.className = "player-top";

  const name = document.createElement("span");
  name.className = "player-name";
  name.textContent = player.Name || "Unknown Player";

  const ratingValue = document.createElement("span");
  ratingValue.className = `rating${rating ? "" : " missing"}`;
  ratingValue.textContent = formattedRating;

  top.append(name, ratingValue);

  const bottom = document.createElement("div");
  bottom.className = "player-bottom";

  const details = document.createElement("span");
  details.textContent = formatSubRating(rating);

  const stats = document.createElement("span");
  stats.textContent = `Score ${player.Score || 0} / G ${player.Goals || 0} / S ${player.Saves || 0}`;

  bottom.append(details, stats);
  article.append(top, bottom);

  return article;
}

function renderTeam(container, players) {
  container.replaceChildren();

  if (players.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Waiting for players";
    container.append(empty);
    return;
  }

  for (const player of players) {
    container.append(playerCard(player));
  }
}

function renderPlayers() {
  const players = [...state.players.values()].sort((a, b) => {
    if (a.TeamNum !== b.TeamNum) {
      return a.TeamNum - b.TeamNum;
    }

    return (b.Score || 0) - (a.Score || 0);
  });

  renderTeam(elements.bluePlayers, players.filter((player) => player.TeamNum === 0));
  renderTeam(elements.orangePlayers, players.filter((player) => player.TeamNum === 1));
}

function updatePlayers(players = []) {
  for (const player of players) {
    const key = playerKey(player);
    state.players.set(key, player);
  }

  renderPlayers();
}

function handleMessage(event) {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (typeof message.Data === "string") {
    try {
      message = { ...message, Data: JSON.parse(message.Data) };
    } catch {
      return;
    }
  }

  if (message.Event === "UpdateState") {
    setStatus("live", "Live");
    updatePlayers(message.Data?.Players);
  }
}

function connect() {
  if (state.socket) {
    state.socket.close();
  }

  let socket;

  try {
    socket = new WebSocket(socketUrl());
  } catch {
    setStatus("error", "Retrying");
    window.setTimeout(connect, state.reconnectDelayMs);
    return;
  }

  state.socket = socket;
  socket.addEventListener("open", () => setStatus("live", "Connected"));
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("error", () => setStatus("error", "Socket Error"));
  socket.addEventListener("close", () => {
    if (state.socket !== socket) {
      return;
    }

    setStatus("error", "Retrying");
    window.setTimeout(connect, state.reconnectDelayMs);
  });
}

loadRatings().then(() => {
  renderPlayers();
  connect();
});
