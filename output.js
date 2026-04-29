const stage = document.querySelector("#stage");
const scoreboardAspect = 1983 / 290;
const state = {
  overlay: null,
  latest: null,
  clock: {
    timeSeconds: null,
    bOvertime: false,
    syncedAt: 0,
  },
  rlSocket: null,
  stateSocket: null,
  renderedModules: new Map(),
};

function wsUrl(path) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${path}`;
}

function fitStage() {
  const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  stage.style.transform = `scale(${scale})`;
}

function parseMessage(event) {
  try {
    const message = JSON.parse(event.data);
    if (typeof message.Data === "string") {
      message.Data = JSON.parse(message.Data);
    }
    return message;
  } catch {
    return null;
  }
}

function displayClockSeconds() {
  if (!Number.isFinite(state.clock.timeSeconds)) {
    return state.latest?.Game?.TimeSeconds;
  }

  const elapsed = (Date.now() - state.clock.syncedAt) / 1000;

  if (state.clock.bOvertime) {
    return state.clock.timeSeconds + elapsed;
  }

  return Math.max(0, state.clock.timeSeconds - elapsed);
}

function syncClock(timeSeconds, bOvertime) {
  if (!Number.isFinite(Number(timeSeconds))) {
    return;
  }

  state.clock.timeSeconds = Number(timeSeconds);
  state.clock.bOvertime = Boolean(bOvertime);
  state.clock.syncedAt = Date.now();
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) {
    return "5:00";
  }

  if (state.clock.bOvertime) {
    return `+${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, Math.ceil(seconds % 60));
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function teams() {
  const apiTeams = state.latest?.Game?.Teams || [];
  const blueApi = apiTeams.find((team) => team.TeamNum === 0) || apiTeams[0] || {};
  const orangeApi = apiTeams.find((team) => team.TeamNum === 1) || apiTeams[1] || {};

  return {
    blue: {
      name: producerTeamName(state.overlay?.meta?.blueName, blueApi.Name, "Blue Team"),
      score: blueApi.Score || 0,
      primary: normalizeTeamColor(blueApi.ColorPrimary, "#168cff"),
      secondary: normalizeTeamColor(blueApi.ColorSecondary, "#dff1ff"),
    },
    orange: {
      name: producerTeamName(state.overlay?.meta?.orangeName, orangeApi.Name, "Orange Team"),
      score: orangeApi.Score || 0,
      primary: normalizeTeamColor(orangeApi.ColorPrimary, "#ff8f1f"),
      secondary: normalizeTeamColor(orangeApi.ColorSecondary, "#fff0df"),
    },
  };
}

function producerTeamName(producerName, apiName, fallback) {
  const name = String(producerName || "").trim();

  if (name && name !== "Blue Team" && name !== "Orange Team") {
    return name;
  }

  return apiName || fallback;
}

function normalizeTeamColor(value, fallback) {
  const hex = String(value || "").trim().replace(/^#/, "");

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
}

function teamColorVars(blue, orange) {
  return [
    `--blue-primary:${blue.primary}`,
    `--blue-secondary:${blue.secondary}`,
    `--orange-primary:${orange.primary}`,
    `--orange-secondary:${orange.secondary}`,
  ].join(";");
}

function playersForTeam(teamNum) {
  return (state.latest?.Players || []).filter((player) => player.TeamNum === teamNum);
}

function teamForPlayer(player) {
  return player.TeamNum === 1 ? teams().orange : teams().blue;
}

function playerKey(player) {
  return [player.TeamNum, player.Shortcut, player.PrimaryId, player.Name].filter(Boolean).join(":");
}

function playerIdentityValues(player) {
  return [
    playerKey(player),
    player.Name,
    player.Shortcut,
    player.PrimaryId,
    player.Id,
    player.SteamID,
    player.EpicAccountId,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function identityCandidates(value) {
  if (!value || typeof value !== "object") {
    return [value].filter(Boolean);
  }

  return [
    playerKey(value),
    value.Name,
    value.Shortcut,
    value.PrimaryId,
    value.Id,
    value.SteamID,
    value.EpicAccountId,
  ].filter(Boolean);
}

function observedPlayerValues() {
  const game = state.latest?.Game || {};
  const meta = state.overlay?.meta || {};

  return [
    game.Target,
    game.TargetPlayer,
    game.FocusedPlayer,
    game.Player,
    game.SpectatedPlayer,
    game.PrimaryPlayer,
    meta.focusedPlayerId,
  ]
    .flatMap(identityCandidates)
    .map((value) => String(value).toLowerCase());
}

function isObservedPlayer(player) {
  const playerValues = playerIdentityValues(player);
  const targetValues = observedPlayerValues();
  return targetValues.some((target) => playerValues.includes(target));
}

function hasBoost(player) {
  return Number.isFinite(Number(player.Boost));
}

function boostValue(player) {
  return hasBoost(player) ? Math.max(0, Math.min(100, Math.round(Number(player.Boost)))) : null;
}

function playerTotals(players) {
  return players.reduce(
    (totals, player) => {
      return {
        goals: totals.goals + (player.Goals || 0),
        saves: totals.saves + (player.Saves || 0),
        assists: totals.assists + (player.Assists || 0),
        demos: totals.demos + (player.Demos || 0),
      };
    },
    { goals: 0, saves: 0, assists: 0, demos: 0 },
  );
}

function moduleStyle(module) {
  const height = module.type === "scoreboard" ? Math.round(module.w / scoreboardAspect) : module.h;
  return `left:${module.x}px;top:${module.y}px;width:${module.w}px;height:${height}px;`;
}

function moduleExitDirection(module) {
  const centerX = module.x + module.w / 2;
  const centerY = module.y + module.h / 2;

  if (centerX < 520) return "left";
  if (centerX > 1080) return "right";
  if (centerY < 300) return "top";
  return "bottom";
}

function moduleClass(module, extra = "") {
  const direction = moduleExitDirection(module);
  return `module ${extra} module-motion motion-${direction}`.trim();
}

function scoreboard(module) {
  const { blue, orange } = teams();
  const meta = state.overlay?.meta || {};
  const blueWins = Number(meta.blueSeriesWins || 0);
  const orangeWins = Number(meta.orangeSeriesWins || 0);
  const seriesLength = Number(meta.seriesLength || 5);
  const dotCount = Math.max(1, seriesLength);
  const dots = Array.from({ length: dotCount }, (_, index) => {
    const className = index < blueWins ? "blue-win" : index >= dotCount - orangeWins ? "orange-win" : "";
    return `<span class="${className}"></span>`;
  }).join("");

  return `
    <section class="${moduleClass(module, "scoreboard")}" data-module-id="${module.id}" style="${moduleStyle(module)}${teamColorVars(blue, orange)}">
      <img class="scoreboard-shell-art" src="./assets/scoreboard-shell-cropped.png" alt="" aria-hidden="true" />
      <svg class="scoreboard-art" viewBox="0 0 1080 140" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="scoreGlass" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"></stop>
            <stop offset="0.36" stop-color="#ffffff" stop-opacity="0.04"></stop>
            <stop offset="1" stop-color="#000000" stop-opacity="0.42"></stop>
          </linearGradient>
          <linearGradient id="bluePlate" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#07111f" stop-opacity="0.96"></stop>
            <stop offset="0.62" stop-color="var(--blue-primary)" stop-opacity="0.42"></stop>
            <stop offset="1" stop-color="#07111f" stop-opacity="0.9"></stop>
          </linearGradient>
          <linearGradient id="orangePlate" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0" stop-color="#160b05" stop-opacity="0.96"></stop>
            <stop offset="0.62" stop-color="var(--orange-primary)" stop-opacity="0.42"></stop>
            <stop offset="1" stop-color="#160b05" stop-opacity="0.9"></stop>
          </linearGradient>
          <linearGradient id="blueScore" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="var(--blue-secondary)"></stop>
            <stop offset="0.45" stop-color="var(--blue-primary)"></stop>
            <stop offset="1" stop-color="#07111f"></stop>
          </linearGradient>
          <linearGradient id="orangeScore" x1="1" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="var(--orange-secondary)"></stop>
            <stop offset="0.45" stop-color="var(--orange-primary)"></stop>
            <stop offset="1" stop-color="#160b05"></stop>
          </linearGradient>
          <pattern id="diagonalHatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
            <rect width="18" height="18" fill="transparent"></rect>
            <rect width="2" height="18" fill="#ffffff" opacity="0.08"></rect>
          </pattern>
          <filter id="hudGlow" x="-25%" y="-60%" width="150%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feColorMatrix in="blur" result="glow" type="matrix" values="0 0 0 0 0.15 0 0 0 0 0.55 0 0 0 0 1 0 0 0 .7 0"></feColorMatrix>
            <feMerge>
              <feMergeNode in="glow"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <filter id="orangeGlow" x="-25%" y="-60%" width="150%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feColorMatrix in="blur" result="glow" type="matrix" values="0 0 0 0 1 0 0 0 0 .45 0 0 0 0 .04 0 0 0 .7 0"></feColorMatrix>
            <feMerge>
              <feMergeNode in="glow"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <filter id="dropPanel" x="-10%" y="-30%" width="120%" height="180%">
            <feDropShadow dx="0" dy="14" stdDeviation="9" flood-color="#000000" flood-opacity="0.55"></feDropShadow>
          </filter>
        </defs>

        <g filter="url(#dropPanel)">
          <path class="plate blue-plate" d="M20 17 H420 L458 122 H52 L31 104 Z"></path>
          <path class="plate orange-plate" d="M1060 17 H660 L622 122 H1028 L1049 104 Z"></path>
          <path class="score-wedge blue-wedge" d="M342 9 H450 L476 132 H374 Z"></path>
          <path class="score-wedge orange-wedge" d="M738 9 H630 L604 132 H706 Z"></path>
          <path class="center-wing left" d="M430 24 H504 L486 126 H402 Z"></path>
          <path class="center-wing right" d="M576 24 H650 L678 126 H594 Z"></path>
          <path class="center-pod" d="M480 18 H600 L626 132 H454 Z"></path>
        </g>

        <path class="plate-shine" d="M43 26 H392 L405 64 H36 Z"></path>
        <path class="plate-shine" d="M1037 26 H688 L675 64 H1044 Z"></path>
        <path class="center-shine" d="M486 26 H594 L606 58 H474 Z"></path>

        <path class="blue-stroke" d="M52 104 H369" filter="url(#hudGlow)"></path>
        <path class="orange-stroke" d="M1028 104 H711" filter="url(#orangeGlow)"></path>
        <path class="blue-stroke thin" d="M344 17 H450" filter="url(#hudGlow)"></path>
        <path class="orange-stroke thin" d="M736 17 H630" filter="url(#orangeGlow)"></path>

      </svg>

      <div class="scoreboard-live">
        <div class="team-name team-blue">${blue.name}</div>
        <div class="score-number score-blue">${blue.score}</div>
        <div class="clock">${formatClock(displayClockSeconds())}</div>
        <div class="series-dots">${dots}</div>
        <div class="score-number score-orange">${orange.score}</div>
        <div class="team-name team-orange">${orange.name}</div>
      </div>
    </section>
  `;
}

function ballSpeed(module) {
  const speed = Number(state.latest?.Game?.Ball?.Speed || 0);
  const ballTeam = state.latest?.Game?.Ball?.TeamNum;
  const { blue, orange } = teams();
  const team = ballTeam === 1 ? orange : blue;
  const maxDisplaySpeed = 140;
  const speedPercent = Math.max(0, Math.min(100, (speed / maxDisplaySpeed) * 100));

  return `
    <section class="${moduleClass(module, "ball-speed")}" data-module-id="${module.id}" style="${moduleStyle(module)}--ball-team-primary:${team.primary};--ball-speed:${speedPercent.toFixed(1)}%;">
      <div>
        <div class="speed-label">Ball Speed</div>
        <div class="speed-value">${speed.toFixed(0)} <small>KPH</small></div>
      </div>
    </section>
  `;
}

function scoreboardV2(module) {
  const { blue, orange } = teams();
  const meta = state.overlay?.meta || {};
  const matchTitle = String(meta.matchTitle || "").trim();
  const blueWins = Number(meta.blueSeriesWins || 0);
  const orangeWins = Number(meta.orangeSeriesWins || 0);
  const seriesLength = Number(meta.seriesLength || 5);
  const dotCount = Math.max(1, seriesLength);
  const dots = Array.from({ length: dotCount }, (_, index) => {
    const className = index < blueWins ? "blue-win" : index >= dotCount - orangeWins ? "orange-win" : "";
    return `<span class="${className}"></span>`;
  }).join("");

  return `
    <section class="${moduleClass(module, "scoreboard scoreboard-v2")}" data-module-id="${module.id}" style="${moduleStyle(module)}${teamColorVars(blue, orange)}">
      ${matchTitle ? `<div class="scoreboard-title-v2">${matchTitle}</div>` : ""}
      <div class="scorebug-v2">
        <div class="team-plate-v2 team-plate-blue">
          <span>${blue.name}</span>
        </div>
        <div class="score-tile-v2 score-tile-blue">
          <span>${blue.score}</span>
        </div>
        <div class="clock-pod-v2">
          <div class="clock">${formatClock(displayClockSeconds())}</div>
          <div class="series-dots">${dots}</div>
        </div>
        <div class="score-tile-v2 score-tile-orange">
          <span>${orange.score}</span>
        </div>
        <div class="team-plate-v2 team-plate-orange">
          <span>${orange.name}</span>
        </div>
      </div>
    </section>
  `;
}

function playerCard(player) {
  const teamClass = player.TeamNum === 1 ? "orange" : "blue";
  const team = teamForPlayer(player);
  const boost = boostValue(player);
  const boostPercent = boost === null ? 0 : boost;
  const observedClass = isObservedPlayer(player) ? " observed" : "";

  return `
    <article class="player-card ${teamClass}${observedClass}" style="--team-primary:${team.primary};--team-secondary:${team.secondary};--boost:${boostPercent}%;">
      <span class="boost-fill" aria-hidden="true"></span>
      <div class="player-name">${player.Name || "Unknown"}</div>
      <div class="boost-readout">${boost === null ? "--" : boost}</div>
    </article>
  `;
}

function roster(module) {
  const team = module.settings?.team || 0;
  const players = playersForTeam(team);
  const teamInfo = team === 1 ? teams().orange : teams().blue;

  return `
    <section class="${moduleClass(module, "roster")}" data-module-id="${module.id}" style="${moduleStyle(module)}--team-primary:${teamInfo.primary};--team-secondary:${teamInfo.secondary};">
      ${players.map(playerCard).join("") || ""}
    </section>
  `;
}

function detailedPlayerCard(player) {
  const team = teamForPlayer(player);
  const boost = boostValue(player);
  const boostPercent = boost === null ? 0 : boost;
  const stats = [
    ["Score", player.Score || 0],
    ["Goals", player.Goals || 0],
    ["Saves", player.Saves || 0],
    ["Assists", player.Assists || 0],
    ["Demos", player.Demos || 0],
  ];

  return `
    <article class="detailed-player-card" style="--team-primary:${team.primary};--team-secondary:${team.secondary};--boost:${boostPercent}%;">
      <div class="detailed-player-head">
        <span>${player.Name || "Unknown"}</span>
        <strong>${boost === null ? "--" : boost}</strong>
      </div>
      <div class="detailed-boost-track" aria-hidden="true"><span></span></div>
      <div class="detailed-stat-grid">
        ${stats.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("")}
      </div>
    </article>
  `;
}

function detailedRoster(module) {
  const team = module.settings?.team || 0;
  const players = playersForTeam(team);
  const teamInfo = team === 1 ? teams().orange : teams().blue;

  return `
    <section class="${moduleClass(module, "detailed-roster")}" data-module-id="${module.id}" style="${moduleStyle(module)}--team-primary:${teamInfo.primary};--team-secondary:${teamInfo.secondary};">
      ${players.map(detailedPlayerCard).join("") || ""}
    </section>
  `;
}

function teamTotals(module) {
  const { blue, orange } = teams();
  const team = module.settings?.team || 0;
  const teamInfo = team === 1 ? orange : blue;
  const teamClass = team === 1 ? "orange" : "blue";
  const totals = playerTotals(playersForTeam(team));
  const stats = [
    ["Goals", totals.goals],
    ["Saves", totals.saves],
    ["Assists", totals.assists],
    ["Demos", totals.demos],
  ];

  return `
    <section class="${moduleClass(module, `team-totals totals-${teamClass}`)}" data-module-id="${module.id}" style="${moduleStyle(module)}--team-primary:${teamInfo.primary};--team-secondary:${teamInfo.secondary};">
      <div class="total-name">${teamInfo.name}</div>
      <div class="total-stats">
        ${stats.map(([label, value]) => `<span><strong>${value}</strong>${label}</span>`).join("")}
      </div>
    </section>
  `;
}

function focusedPlayer(module) {
  const players = state.latest?.Players || [];
  const focusedId = state.overlay?.meta?.focusedPlayerId;
  const player = players.find(isObservedPlayer) || players.find((item) => playerKey(item) === focusedId) || players[0];

  if (!player) {
    return `<section class="${moduleClass(module, "focused-player")}" data-module-id="${module.id}" style="${moduleStyle(module)}"><h2>No Player</h2></section>`;
  }

  const team = teamForPlayer(player);
  const teamClass = player.TeamNum === 1 ? "orange" : "blue";
  const boost = boostValue(player);
  const boostPercent = boost === null ? 0 : boost;
  const stats = [
    ["Score", player.Score || 0],
    ["Goals", player.Goals || 0],
    ["Shots", player.Shots || 0],
    ["Assist", player.Assists || 0],
    ["Saves", player.Saves || 0],
  ];

  return `
    <section class="${moduleClass(module, `focused-player focused-${teamClass}`)}" data-module-id="${module.id}" style="${moduleStyle(module)}--team-primary:${team.primary};--team-secondary:${team.secondary};--boost:${boostPercent}%;">
      <div class="focus-nameplate">
        <span>${player.Name || "Unknown"}</span>
      </div>
      <div class="focus-stat-strip">
        ${stats.map(([label, value]) => `<div class="focus-stat"><strong>${value}</strong><span>${label}</span></div>`).join("")}
      </div>
      <div class="focus-boost">
        <span>${boost === null ? "--" : boost}</span>
      </div>
      <div class="focus-boost-track" aria-hidden="true"><span></span></div>
    </section>
  `;
}

function shouldShowModule(module) {
  return module.visible;
}

function renderModule(module) {
  if (!shouldShowModule(module)) {
    return "";
  }

  if (module.type === "scoreboard") return scoreboardV2(module);
  if (module.type === "ballSpeed") return ballSpeed(module);
  if (module.type === "roster") return roster(module);
  if (module.type === "detailedRoster") return detailedRoster(module);
  if (module.type === "teamTotals") return teamTotals(module);
  if (module.type === "focusedPlayer") return focusedPlayer(module);
  return "";
}

function render() {
  if (!state.overlay) {
    return;
  }

  const activeIds = new Set(state.overlay.modules.filter(shouldShowModule).map((module) => module.id));

  for (const module of state.overlay.modules) {
    const html = renderModule(module);
    const existing = state.renderedModules.get(module.id);

    if (html) {
      if (existing?.removeTimer) {
        window.clearTimeout(existing.removeTimer);
        existing.removeTimer = null;
        existing.motionLockUntil = Date.now() + 720;
        existing.node.dataset.motionState = "visible";
      }

      if (!existing) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const node = wrapper.firstElementChild;
        node.dataset.motionState = "enter";
        stage.append(node);
        state.renderedModules.set(module.id, {
          node,
          removeTimer: null,
          motionLockUntil: Date.now() + 720,
        });
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            node.dataset.motionState = "visible";
          });
        });
      } else {
        if (Date.now() < existing.motionLockUntil || existing.node.dataset.motionState !== "visible") {
          continue;
        }

        existing.node.outerHTML = html;
        const node = stage.querySelector(`[data-module-id="${module.id}"]`);
        node.dataset.motionState = "visible";
        state.renderedModules.set(module.id, { node, removeTimer: null, motionLockUntil: 0 });
      }
    }
  }

  for (const [id, entry] of state.renderedModules.entries()) {
    if (activeIds.has(id) || entry.removeTimer) {
      continue;
    }

    entry.node.dataset.motionState = "exit";
    entry.motionLockUntil = Date.now() + 720;
    entry.removeTimer = window.setTimeout(() => {
      entry.node.remove();
      state.renderedModules.delete(id);
    }, 720);
  }
}

function updateClockText() {
  const clock = stage.querySelector(".clock");

  if (clock) {
    clock.textContent = formatClock(displayClockSeconds());
  }
}

async function loadInitialState() {
  const response = await fetch("./api/overlay-state", { cache: "no-store" });
  state.overlay = await response.json();
  render();
}

function connectRocketLeague() {
  state.rlSocket = new WebSocket(wsUrl("/rl"));
  state.rlSocket.addEventListener("message", (event) => {
    const message = parseMessage(event);
    if (message?.Event === "UpdateState") {
      state.latest = message.Data;
      syncClock(message.Data?.Game?.TimeSeconds, message.Data?.Game?.bOvertime);
      render();
    }

    if (message?.Event === "ClockUpdatedSeconds") {
      state.latest = state.latest || { Game: {} };
      state.latest.Game = state.latest.Game || {};
      state.latest.Game.TimeSeconds = message.Data?.TimeSeconds;
      state.latest.Game.bOvertime = message.Data?.bOvertime;
      syncClock(message.Data?.TimeSeconds, message.Data?.bOvertime);
      render();
    }
  });
  state.rlSocket.addEventListener("close", () => window.setTimeout(connectRocketLeague, 1200));
}

function connectOverlayState() {
  state.stateSocket = new WebSocket(wsUrl("/overlay-state"));
  state.stateSocket.addEventListener("message", (event) => {
    const message = parseMessage(event);
    if (message?.type === "overlayState") {
      state.overlay = message.state;
      render();
    }

    if (message?.type === "outputRefresh") {
      window.location.reload();
    }
  });
  state.stateSocket.addEventListener("close", () => window.setTimeout(connectOverlayState, 1200));
}

loadInitialState();
connectRocketLeague();
connectOverlayState();
fitStage();
window.addEventListener("resize", fitStage);
window.setInterval(updateClockText, 250);
