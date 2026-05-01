const canvasSize = { width: 1600, height: 900 };
const gridSize = 20;
const scoreboardAspect = 1983 / 290;
const state = {
  overlay: null,
  selectedId: null,
  selectedIds: new Set(),
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
  blueTeamFontScale: document.querySelector("#blueTeamFontScale"),
  orangeTeamFontScale: document.querySelector("#orangeTeamFontScale"),
  seriesLength: document.querySelector("#seriesLength"),
  blueSeriesWins: document.querySelector("#blueSeriesWins"),
  orangeSeriesWins: document.querySelector("#orangeSeriesWins"),
  focusedPlayerId: document.querySelector("#focusedPlayerId"),
  toggleFocusButton: document.querySelector("#toggleFocusButton"),
  previewGoalButton: document.querySelector("#previewGoalButton"),
  selectedHint: document.querySelector("#selectedHint"),
  selectedForm: document.querySelector("#selectedForm"),
  moduleX: document.querySelector("#moduleX"),
  moduleY: document.querySelector("#moduleY"),
  moduleW: document.querySelector("#moduleW"),
  moduleH: document.querySelector("#moduleH"),
  moduleTeamSetting: document.querySelector("#moduleTeamSetting"),
  moduleTeam: document.querySelector("#moduleTeam"),
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

function isSelected(moduleId) {
  return state.selectedIds.has(moduleId);
}

function selectModule(id) {
  state.selectedId = id;
  state.selectedIds = new Set(id ? [id] : []);
  render();
}

function toggleModuleSelection(id) {
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
    if (state.selectedId === id) {
      state.selectedId = state.selectedIds.values().next().value || null;
    }
  } else {
    state.selectedIds.add(id);
    state.selectedId = id;
  }

  render();
}

function playerKey(player) {
  return [player.TeamNum, player.Shortcut, player.PrimaryId, player.Name].filter(Boolean).join(":");
}

function scale() {
  return elements.canvas.clientWidth / canvasSize.width;
}

function moduleLabel(module) {
  if (module.type === "teamTotals") {
    return "Team Totals";
  }

  const labels = {
    scoreboard: "Scoreboard",
    ballSpeed: "Ball Speed",
    roster: module.settings?.team === 1 ? "Orange Roster" : "Blue Roster",
    detailedRoster: module.settings?.team === 1 ? "Orange Detailed Roster" : "Blue Detailed Roster",
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
    elements.moduleTeamSetting.hidden = true;
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

function isRosterModule(module) {
  return module?.type === "roster" || module?.type === "detailedRoster";
}

function counterpartRoster(module) {
  if (!isRosterModule(module)) {
    return null;
  }

  const team = module.settings?.team || 0;
  return state.overlay.modules.find(
    (item) => item.type === module.type && (item.settings?.team || 0) !== team,
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

function moduleGroup(module) {
  if (module.type === "scoreboard" || module.type === "ballSpeed") {
    return { id: "core", label: "Core" };
  }

  if (module.type === "roster") {
    return { id: "compact-rosters", label: "Compact Rosters" };
  }

  if (module.type === "detailedRoster") {
    return { id: "detailed-rosters", label: "Detailed Rosters" };
  }

  if (module.type === "teamTotals") {
    return { id: "stats", label: "Stats" };
  }

  if (module.type === "focusedPlayer") {
    return { id: "focus", label: "Focus" };
  }

  return { id: "other", label: "Other" };
}

function setModulesVisible(modules, isVisible) {
  for (const module of modules) {
    module.visible = isVisible;
  }

  if (!isVisible) {
    for (const module of modules) {
      state.selectedIds.delete(module.id);
    }
    if (!state.selectedIds.has(state.selectedId)) {
      state.selectedId = state.selectedIds.values().next().value || null;
    }
  }

  render();
  markDirty();
}

function renderModuleList() {
  elements.moduleList.replaceChildren();
  const groupOrder = ["core", "compact-rosters", "detailed-rosters", "stats", "focus", "other"];
  const groupsById = new Map();

  for (const module of state.overlay.modules) {
    const group = moduleGroup(module);
    let entry = groupsById.get(group.id);

    if (!entry) {
      entry = { ...group, modules: [] };
      groupsById.set(group.id, entry);
    }

    entry.modules.push(module);
  }

  const groups = [...groupsById.values()].sort(
    (a, b) => groupOrder.indexOf(a.id) - groupOrder.indexOf(b.id),
  );

  for (const group of groups) {
    const groupNode = document.createElement("div");
    groupNode.className = "module-group";
    const anyVisible = group.modules.some((module) => module.visible);
    groupNode.dataset.visible = anyVisible;
    groupNode.innerHTML = `
      <div class="module-group-header">
        <span class="group-icon" aria-hidden="true"></span>
        <span>${group.label}</span>
        <button class="visibility-toggle group-visibility-toggle" type="button" aria-label="${anyVisible ? "Hide" : "Show"} ${group.label}" title="${anyVisible ? "Hide" : "Show"} ${group.label}">
          ${eyeIcon(anyVisible)}
        </button>
      </div>
      <div class="module-group-items"></div>
    `;

    groupNode.querySelector(".group-visibility-toggle").addEventListener("click", () => {
      setModulesVisible(group.modules, !anyVisible);
    });

    const items = groupNode.querySelector(".module-group-items");

    for (const module of group.modules) {
      const row = document.createElement("div");
      row.className = "module-row";
      row.dataset.selected = isSelected(module.id);
      row.dataset.visible = module.visible;
      row.innerHTML = `
        <button class="module-select" type="button">
          <strong>${moduleLabel(module)}</strong>
          <span>${module.type}</span>
        </button>
        ${
          module.type === "teamTotals"
            ? `
              <label class="module-inline-setting" aria-label="Team Totals team">
                <select class="module-team-select">
                  <option value="0"${(module.settings?.team || 0) === 0 ? " selected" : ""}>Blue</option>
                  <option value="1"${(module.settings?.team || 0) === 1 ? " selected" : ""}>Orange</option>
                </select>
              </label>
            `
            : ""
        }
        <button class="visibility-toggle" type="button" aria-label="${module.visible ? "Hide" : "Show"} ${moduleLabel(module)}" title="${module.visible ? "Hide" : "Show"}">
          ${eyeIcon(module.visible)}
        </button>
      `;
      row.addEventListener("click", (event) => {
        if (event.shiftKey) {
          toggleModuleSelection(module.id);
        } else {
          selectModule(module.id);
        }
      });
      row.querySelector(".module-team-select")?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      row.querySelector(".module-team-select")?.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      row.querySelector(".module-team-select")?.addEventListener("change", (event) => {
        event.stopPropagation();
        module.settings = { ...(module.settings || {}), team: Number(event.currentTarget.value || 0) };
        render();
        markDirty();
      });
      row.querySelector(".visibility-toggle").addEventListener("click", (event) => {
        event.stopPropagation();
        module.visible = !module.visible;
        if (module.visible) {
          selectModule(module.id);
        } else {
          state.selectedIds.delete(module.id);
          if (state.selectedId === module.id) {
            state.selectedId = state.selectedIds.values().next().value || null;
          }
          render();
        }
        markDirty();
      });
      items.append(row);
    }

    elements.moduleList.append(groupNode);
  }
}

function setFocusModuleVisible(isVisible) {
  for (const focusModule of state.overlay.modules.filter((module) => module.type === "focusedPlayer")) {
    focusModule.visible = isVisible;
  }
}

function toggleFocusedView() {
  const focusModules = state.overlay.modules.filter((module) => module.type === "focusedPlayer");
  const anyFocusedVisible = focusModules.some((module) => module.visible);

  setFocusModuleVisible(!anyFocusedVisible);
  render();
  markDirty();
}

function renderCanvas() {
  elements.canvas.replaceChildren();
  const ratio = scale();

  for (const module of state.overlay.modules) {
    if (!module.visible && !isSelected(module.id)) {
      continue;
    }

    const node = document.createElement("div");
    node.className = "canvas-module";
    node.dataset.id = module.id;
    node.dataset.selected = isSelected(module.id);
    node.dataset.visible = module.visible;
    node.dataset.toolsPlacement = module.y * ratio < 38 ? "bottom" : "top";
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

    if (isRosterModule(module)) {
      const sync = document.createElement("button");
      sync.type = "button";
      sync.className = "center-tool sync-tool";
      sync.title = "Match other roster size";
      sync.setAttribute("aria-label", `Sync ${moduleLabel(module)} size to the other ${module.type === "detailedRoster" ? "detailed roster" : "roster"}`);
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
  elements.blueTeamFontScale.value = meta.blueTeamFontScale || 100;
  elements.orangeTeamFontScale.value = meta.orangeTeamFontScale || 100;
  elements.seriesLength.value = meta.seriesLength || 5;
  elements.blueSeriesWins.value = meta.blueSeriesWins || 0;
  elements.orangeSeriesWins.value = meta.orangeSeriesWins || 0;
  const anyFocusedVisible = state.overlay.modules.some((module) => module.type === "focusedPlayer" && module.visible);
  elements.toggleFocusButton.textContent = anyFocusedVisible ? "Hide Focus" : "Show Focus";
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
  elements.moduleTeamSetting.hidden = module.type !== "teamTotals";

  if (module.type === "teamTotals") {
    elements.moduleTeam.value = String(module.settings?.team || 0);
  }
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
    blueTeamFontScale: Number(elements.blueTeamFontScale.value || 100),
    orangeTeamFontScale: Number(elements.orangeTeamFontScale.value || 100),
    matchTitle: elements.matchTitle.value,
    seriesLength: Number(elements.seriesLength.value || 5),
    blueSeriesWins: Number(elements.blueSeriesWins.value || 0),
    orangeSeriesWins: Number(elements.orangeSeriesWins.value || 0),
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

  if (module.type === "teamTotals") {
    module.settings = { ...(module.settings || {}), team: Number(elements.moduleTeam.value || 0) };
  }

  if (module.type === "scoreboard") {
    module.h = moduleDisplayHeight(module);
  }

  renderModuleList();
  renderCanvas();
  markDirty();
}

function selectedDragModules(moduleId) {
  const selectedModules = state.overlay.modules.filter((module) => isSelected(module.id));
  return selectedModules.some((module) => module.id === moduleId)
    ? selectedModules
    : state.overlay.modules.filter((module) => module.id === moduleId);
}

function moveSelectedModules(dx, dy) {
  const modules = state.overlay?.modules.filter((module) => isSelected(module.id)) || [];

  if (modules.length === 0) {
    return;
  }

  const minDx = Math.max(...modules.map((module) => -module.x));
  const maxDx = Math.min(...modules.map((module) => canvasSize.width - (module.x + module.w)));
  const minDy = Math.max(...modules.map((module) => -module.y));
  const maxDy = Math.min(...modules.map((module) => canvasSize.height - (module.y + moduleDisplayHeight(module))));
  const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
  const clampedDy = Math.max(minDy, Math.min(maxDy, dy));

  if (clampedDx === 0 && clampedDy === 0) {
    return;
  }

  for (const module of modules) {
    module.x = snap(module.x + clampedDx);
    module.y = snap(module.y + clampedDy);
  }

  renderCanvas();
  renderSelectedForm();
  markDirty();
}

function isEditingField(target) {
  return target.closest?.("input, textarea, select, button, [contenteditable='true']");
}

function startDrag(event, moduleId, mode) {
  event.preventDefault();
  event.stopPropagation();

  if (event.shiftKey && mode === "move") {
    toggleModuleSelection(moduleId);
    return;
  }

  if (mode === "resize" || !isSelected(moduleId)) {
    selectModule(moduleId);
  } else {
    state.selectedId = moduleId;
  }

  const module = state.overlay.modules.find((item) => item.id === moduleId);
  const ratio = scale();
  const modules = mode === "move" ? selectedDragModules(moduleId) : [module];

  state.drag = {
    mode,
    module,
    modules: modules.map((item) => ({
      module: item,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    })),
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
    const snappedDx = snap(dx);
    const snappedDy = snap(dy);
    const minDx = Math.max(...state.drag.modules.map((item) => -item.x));
    const maxDx = Math.min(
      ...state.drag.modules.map((item) => canvasSize.width - (item.x + item.w)),
    );
    const minDy = Math.max(...state.drag.modules.map((item) => -item.y));
    const maxDy = Math.min(
      ...state.drag.modules.map((item) => canvasSize.height - (item.y + moduleDisplayHeight(item.module))),
    );
    const clampedDx = Math.max(minDx, Math.min(maxDx, snappedDx));
    const clampedDy = Math.max(minDy, Math.min(maxDy, snappedDy));

    for (const item of state.drag.modules) {
      item.module.x = item.x + clampedDx;
      item.module.y = item.y + clampedDy;
    }
  }

  renderCanvas();
  renderSelectedForm();
  markDirty();
}

function onPointerUp() {
  state.drag = null;
}

function onKeyDown(event) {
  if (isEditingField(event.target)) {
    return;
  }

  const moves = {
    ArrowLeft: [-gridSize, 0],
    ArrowRight: [gridSize, 0],
    ArrowUp: [0, -gridSize],
    ArrowDown: [0, gridSize],
  };
  const move = moves[event.key];

  if (!move) {
    return;
  }

  event.preventDefault();
  moveSelectedModules(move[0], move[1]);
}

async function loadState() {
  const response = await fetch("./api/overlay-state", { cache: "no-store" });
  state.overlay = await response.json();
  state.selectedId = state.overlay.modules[0]?.id || null;
  state.selectedIds = new Set(state.selectedId ? [state.selectedId] : []);
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
  state.selectedIds = new Set(state.selectedId ? [state.selectedId] : []);
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

async function previewGoal() {
  await saveState();
  const focusedId = state.overlay?.meta?.focusedPlayerId;
  const player = state.players.find((item) => playerKey(item) === focusedId) || state.players[0];
  const scorerName = player?.Name || "Preview Player";
  const teamNum = Number.isFinite(Number(player?.TeamNum)) ? Number(player.TeamNum) : 0;

  await fetch("./api/goal-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scorerName, teamNum }),
  });

  const originalText = elements.previewGoalButton.textContent;
  elements.previewGoalButton.textContent = "Goal Preview Sent";
  window.setTimeout(() => {
    elements.previewGoalButton.textContent = originalText;
  }, 1200);
}

[
  elements.blueName,
  elements.orangeName,
  elements.blueTeamFontScale,
  elements.orangeTeamFontScale,
  elements.matchTitle,
  elements.seriesLength,
  elements.blueSeriesWins,
  elements.orangeSeriesWins,
  elements.focusedPlayerId,
].forEach((input) => input.addEventListener("input", updateMeta));

[
  elements.moduleX,
  elements.moduleY,
  elements.moduleW,
  elements.moduleH,
  elements.moduleTeam,
].forEach((input) => input.addEventListener("input", updateSelectedModule));

elements.saveButton.addEventListener("click", saveState);
elements.refreshButton.addEventListener("click", refreshOutput);
elements.resetButton.addEventListener("click", resetState);
elements.toggleFocusButton.addEventListener("click", toggleFocusedView);
elements.previewGoalButton.addEventListener("click", previewGoal);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", renderCanvas);

loadState();
connectRocketLeague();
