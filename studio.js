const canvasSize = { width: 1600, height: 900 };
const gridSize = 20;
const scoreboardAspect = 1983 / 290;
const state = {
  overlay: null,
  selectedId: null,
  players: [],
  drag: null,
  dirtyTimer: null,
};

const elements = {
  canvas: document.querySelector("#canvas"),
  moduleList: document.querySelector("#moduleList"),
  connectionStatus: document.querySelector("#connectionStatus"),
  matchTitle: document.querySelector("#matchTitle"),
  blueName: document.querySelector("#blueName"),
  orangeName: document.querySelector("#orangeName"),
  seriesLength: document.querySelector("#seriesLength"),
  blueSeriesWins: document.querySelector("#blueSeriesWins"),
  orangeSeriesWins: document.querySelector("#orangeSeriesWins"),
  viewMode: document.querySelector("#viewMode"),
  focusedPlayerId: document.querySelector("#focusedPlayerId"),
  toggleFocusButton: document.querySelector("#toggleFocusButton"),
  toggleRostersButton: document.querySelector("#toggleRostersButton"),
  selectedHint: document.querySelector("#selectedHint"),
  selectedForm: document.querySelector("#selectedForm"),
  moduleX: document.querySelector("#moduleX"),
  moduleY: document.querySelector("#moduleY"),
  moduleW: document.querySelector("#moduleW"),
  moduleH: document.querySelector("#moduleH"),
  saveButton: document.querySelector("#saveButton"),
  refreshButton: document.querySelector("#refreshButton"),
  resetButton: document.querySelector("#resetButton"),
};

function wsUrl(path) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${path}`;
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

function selectedModule() {
  return state.overlay?.modules.find((module) => module.id === state.selectedId);
}

function playerKey(player) {
  return [player.TeamNum, player.Shortcut, player.PrimaryId, player.Name].filter(Boolean).join(":");
}

function scale() {
  return elements.canvas.clientWidth / canvasSize.width;
}

function moduleLabel(module) {
  const labels = {
    scoreboard: "Scoreboard",
    ballSpeed: "Ball Speed",
    roster: module.settings?.team === 1 ? "Orange Roster" : "Blue Roster",
    teamTotals: "Team Totals",
    focusedPlayer: "Focused Player",
  };

  return labels[module.type] || module.type;
}

function snap(value) {
  return Math.round(value / gridSize) * gridSize;
}

function moduleDisplayHeight(module) {
  return module.type === "scoreboard" ? snap(module.w / scoreboardAspect) : module.h;
}

function centerModule(moduleId, axis) {
  const module = state.overlay.modules.find((item) => item.id === moduleId);

  if (!module) {
    return;
  }

  if (axis === "x") {
    module.x = snap((canvasSize.width - module.w) / 2);
  }

  if (axis === "y") {
    module.y = snap((canvasSize.height - module.h) / 2);
  }

  selectModule(module.id);
  markDirty();
}

function counterpartRoster(module) {
  if (module?.type !== "roster") {
    return null;
  }

  const team = module.settings?.team || 0;
  return state.overlay.modules.find(
    (item) => item.type === "roster" && (item.settings?.team || 0) !== team,
  );
}

function syncRosterSize(moduleId) {
  const module = state.overlay.modules.find((item) => item.id === moduleId);
  const source = counterpartRoster(module);

  if (!module || !source) {
    return;
  }

  module.w = source.w;
  module.h = source.h;
  selectModule(module.id);
  markDirty();
}

function eyeIcon(isVisible) {
  if (isVisible) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.1 12s3.5-6.2 9.9-6.2S21.9 12 21.9 12s-3.5 6.2-9.9 6.2S2.1 12 2.1 12Z"></path>
        <circle cx="12" cy="12" r="2.8"></circle>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18"></path>
      <path d="M10.6 5.9c.5-.1.9-.1 1.4-.1 6.4 0 9.9 6.2 9.9 6.2a17 17 0 0 1-3.1 3.8"></path>
      <path d="M6.3 6.9A17.4 17.4 0 0 0 2.1 12s3.5 6.2 9.9 6.2c1.8 0 3.3-.5 4.6-1.2"></path>
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2"></path>
    </svg>
  `;
}

function renderModuleList() {
  elements.moduleList.replaceChildren();
  const rosters = state.overlay.modules.filter((module) => module.type === "roster");
  const anyRosterVisible = rosters.some((module) => module.visible);
  elements.toggleRostersButton.textContent = anyRosterVisible ? "Hide Rosters" : "Show Rosters";

  for (const module of state.overlay.modules) {
    const row = document.createElement("div");
    row.className = "module-row";
    row.dataset.selected = module.id === state.selectedId;
    row.dataset.visible = module.visible;
    row.innerHTML = `
      <button class="module-select" type="button">
        <strong>${moduleLabel(module)}</strong>
        <span>${module.type}</span>
      </button>
      <button class="visibility-toggle" type="button" aria-label="${module.visible ? "Hide" : "Show"} ${moduleLabel(module)}" title="${module.visible ? "Hide" : "Show"}">
        ${eyeIcon(module.visible)}
      </button>
    `;
    row.addEventListener("click", () => selectModule(module.id));
    row.querySelector(".visibility-toggle").addEventListener("click", (event) => {
      event.stopPropagation();
      module.visible = !module.visible;
      if (module.visible) {
        selectModule(module.id);
      } else {
        state.selectedId = null;
        render();
      }
      markDirty();
    });
    elements.moduleList.append(row);
  }
}

function toggleRosters() {
  const rosters = state.overlay.modules.filter((module) => module.type === "roster");
  const anyRosterVisible = rosters.some((module) => module.visible);

  for (const roster of rosters) {
    roster.visible = !anyRosterVisible;
  }

  renderModuleList();
  renderCanvas();
  markDirty();
}

function setRosterModulesVisible(isVisible) {
  for (const roster of state.overlay.modules.filter((module) => module.type === "roster")) {
    roster.visible = isVisible;
  }
}

function setFocusModuleVisible(isVisible) {
  for (const focusModule of state.overlay.modules.filter((module) => module.type === "focusedPlayer")) {
    focusModule.visible = isVisible;
  }
}

function toggleFocusedView() {
  const isFocused = state.overlay.meta.viewMode === "focus";

  state.overlay.meta.viewMode = isFocused ? "basic" : "focus";
  setRosterModulesVisible(isFocused);
  setFocusModuleVisible(!isFocused);
  render();
  markDirty();
}

function renderCanvas() {
  elements.canvas.replaceChildren();
  const ratio = scale();

  for (const module of state.overlay.modules) {
    if (!module.visible && module.id !== state.selectedId) {
      continue;
    }

    const node = document.createElement("div");
    node.className = "canvas-module";
    node.dataset.id = module.id;
    node.dataset.selected = module.id === state.selectedId;
    node.dataset.visible = module.visible;
    node.style.left = `${module.x * ratio}px`;
    node.style.top = `${module.y * ratio}px`;
    node.style.width = `${module.w * ratio}px`;
    node.style.height = `${moduleDisplayHeight(module) * ratio}px`;
    node.textContent = moduleLabel(module);
    node.addEventListener("pointerdown", (event) => startDrag(event, module.id, "move"));

    const tools = document.createElement("div");
    tools.className = "module-tools";

    const centerX = document.createElement("button");
    centerX.type = "button";
    centerX.className = "center-tool";
    centerX.title = "Center horizontally";
    centerX.setAttribute("aria-label", `Center ${moduleLabel(module)} horizontally`);
    centerX.textContent = "H";
    centerX.addEventListener("pointerdown", (event) => event.stopPropagation());
    centerX.addEventListener("click", (event) => {
      event.stopPropagation();
      centerModule(module.id, "x");
    });

    const centerY = document.createElement("button");
    centerY.type = "button";
    centerY.className = "center-tool";
    centerY.title = "Center vertically";
    centerY.setAttribute("aria-label", `Center ${moduleLabel(module)} vertically`);
    centerY.textContent = "V";
    centerY.addEventListener("pointerdown", (event) => event.stopPropagation());
    centerY.addEventListener("click", (event) => {
      event.stopPropagation();
      centerModule(module.id, "y");
    });

    tools.append(centerX, centerY);

    if (module.type === "roster") {
      const sync = document.createElement("button");
      sync.type = "button";
      sync.className = "center-tool sync-tool";
      sync.title = "Match other roster size";
      sync.setAttribute("aria-label", `Sync ${moduleLabel(module)} size to the other roster`);
      sync.textContent = "S";
      sync.addEventListener("pointerdown", (event) => event.stopPropagation());
      sync.addEventListener("click", (event) => {
        event.stopPropagation();
        syncRosterSize(module.id);
      });
      tools.append(sync);
    }

    node.append(tools);

    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.addEventListener("pointerdown", (event) => startDrag(event, module.id, "resize"));
    node.append(handle);
    elements.canvas.append(node);
  }
}

function renderMetaForm() {
  const meta = state.overlay.meta;
  elements.matchTitle.value = meta.matchTitle || "";
  elements.blueName.value = meta.blueName || "";
  elements.orangeName.value = meta.orangeName || "";
  elements.seriesLength.value = meta.seriesLength || 5;
  elements.blueSeriesWins.value = meta.blueSeriesWins || 0;
  elements.orangeSeriesWins.value = meta.orangeSeriesWins || 0;
  elements.viewMode.value = meta.viewMode || "basic";
  elements.toggleFocusButton.textContent =
    meta.viewMode === "focus" ? "Switch to Rosters" : "Switch to Focus";
  renderFocusedPlayers();
}

function renderFocusedPlayers() {
  const selected = state.overlay?.meta?.focusedPlayerId || "";
  elements.focusedPlayerId.replaceChildren(new Option("Auto", ""));

  for (const player of state.players) {
    elements.focusedPlayerId.append(new Option(player.Name || "Unknown", playerKey(player)));
  }

  elements.focusedPlayerId.value = selected;
}

function renderSelectedForm() {
  const module = selectedModule();
  elements.selectedForm.hidden = !module;
  elements.selectedHint.hidden = Boolean(module);

  if (!module) {
    return;
  }

  elements.moduleX.value = module.x;
  elements.moduleY.value = module.y;
  elements.moduleW.value = module.w;
  elements.moduleH.value = module.h;
}

function render() {
  if (!state.overlay) {
    return;
  }

  renderMetaForm();
  renderModuleList();
  renderCanvas();
  renderSelectedForm();
}

function selectModule(id) {
  state.selectedId = id;
  render();
}

function markDirty() {
  window.clearTimeout(state.dirtyTimer);
  state.dirtyTimer = window.setTimeout(saveState, 180);
}

async function saveState() {
  if (!state.overlay) {
    return;
  }

  await fetch("./api/overlay-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.overlay),
  });
}

function updateMeta() {
  Object.assign(state.overlay.meta, {
    blueName: elements.blueName.value,
    orangeName: elements.orangeName.value,
    matchTitle: elements.matchTitle.value,
    seriesLength: Number(elements.seriesLength.value || 5),
    blueSeriesWins: Number(elements.blueSeriesWins.value || 0),
    orangeSeriesWins: Number(elements.orangeSeriesWins.value || 0),
    viewMode: elements.viewMode.value,
    focusedPlayerId: elements.focusedPlayerId.value,
  });
  markDirty();
}

function updateSelectedModule() {
  const module = selectedModule();

  if (!module) {
    return;
  }

  Object.assign(module, {
    x: Number(elements.moduleX.value || 0),
    y: Number(elements.moduleY.value || 0),
    w: Number(elements.moduleW.value || 100),
    h: Number(elements.moduleH.value || 60),
  });

  if (module.type === "scoreboard") {
    module.h = moduleDisplayHeight(module);
  }

  renderModuleList();
  renderCanvas();
  markDirty();
}

function startDrag(event, moduleId, mode) {
  event.preventDefault();
  event.stopPropagation();
  selectModule(moduleId);
  const module = selectedModule();
  const ratio = scale();

  state.drag = {
    mode,
    module,
    startX: event.clientX,
    startY: event.clientY,
    moduleX: module.x,
    moduleY: module.y,
    moduleW: module.w,
    moduleH: module.h,
    ratio,
  };

  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.drag) {
    return;
  }

  const dx = (event.clientX - state.drag.startX) / state.drag.ratio;
  const dy = (event.clientY - state.drag.startY) / state.drag.ratio;
  const { module } = state.drag;

  if (state.drag.mode === "resize") {
    module.w = Math.max(80, snap(state.drag.moduleW + dx));
    module.h = Math.max(60, snap(state.drag.moduleH + dy));
    if (module.type === "scoreboard") {
      module.h = moduleDisplayHeight(module);
    }
  } else {
    module.x = Math.max(0, Math.min(canvasSize.width - module.w, snap(state.drag.moduleX + dx)));
    module.y = Math.max(0, Math.min(canvasSize.height - module.h, snap(state.drag.moduleY + dy)));
  }

  renderCanvas();
  renderSelectedForm();
  markDirty();
}

function onPointerUp() {
  state.drag = null;
}

async function loadState() {
  const response = await fetch("./api/overlay-state", { cache: "no-store" });
  state.overlay = await response.json();
  state.selectedId = state.overlay.modules[0]?.id || null;
  render();
}

function connectRocketLeague() {
  const socket = new WebSocket(wsUrl("/rl"));
  socket.addEventListener("open", () => {
    elements.connectionStatus.textContent = "Rocket League Live";
  });
  socket.addEventListener("message", (event) => {
    const message = parseMessage(event);
    if (message?.Event === "UpdateState") {
      state.players = message.Data?.Players || [];
      renderFocusedPlayers();
    }
  });
  socket.addEventListener("close", () => {
    elements.connectionStatus.textContent = "Reconnecting";
    window.setTimeout(connectRocketLeague, 1200);
  });
}

async function resetState() {
  const response = await fetch("./api/overlay-state/reset", { method: "POST" });
  state.overlay = await response.json();
  state.selectedId = state.overlay.modules[0]?.id || null;
  render();
}

async function refreshOutput() {
  await saveState();
  await fetch("./api/output-refresh", { method: "POST" });
  const originalText = elements.refreshButton.textContent;
  elements.refreshButton.textContent = "Output Refreshed";
  window.setTimeout(() => {
    elements.refreshButton.textContent = originalText;
  }, 1200);
}

[
  elements.blueName,
  elements.orangeName,
  elements.matchTitle,
  elements.seriesLength,
  elements.blueSeriesWins,
  elements.orangeSeriesWins,
  elements.viewMode,
  elements.focusedPlayerId,
].forEach((input) => input.addEventListener("input", updateMeta));

[
  elements.moduleX,
  elements.moduleY,
  elements.moduleW,
  elements.moduleH,
].forEach((input) => input.addEventListener("input", updateSelectedModule));

elements.saveButton.addEventListener("click", saveState);
elements.refreshButton.addEventListener("click", refreshOutput);
elements.resetButton.addEventListener("click", resetState);
elements.toggleFocusButton.addEventListener("click", toggleFocusedView);
elements.toggleRostersButton.addEventListener("click", toggleRosters);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("resize", renderCanvas);

loadState();
connectRocketLeague();
