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
  blueLogoUrl: document.querySelector("#blueLogoUrl"),
  blueLogoUpload: document.querySelector("#blueLogoUpload"),
  clearBlueLogoButton: document.querySelector("#clearBlueLogoButton"),
  orangeName: document.querySelector("#orangeName"),
  orangeLogoUrl: document.querySelector("#orangeLogoUrl"),
  orangeLogoUpload: document.querySelector("#orangeLogoUpload"),
  clearOrangeLogoButton: document.querySelector("#clearOrangeLogoButton"),
  blueTeamFontScale: document.querySelector("#blueTeamFontScale"),
  orangeTeamFontScale: document.querySelector("#orangeTeamFontScale"),
  blueUseCustomColors: document.querySelector("#blueUseCustomColors"),
  bluePrimaryColorPicker: document.querySelector("#bluePrimaryColorPicker"),
  bluePrimaryColor: document.querySelector("#bluePrimaryColor"),
  blueSecondaryColorPicker: document.querySelector("#blueSecondaryColorPicker"),
  blueSecondaryColor: document.querySelector("#blueSecondaryColor"),
  orangeUseCustomColors: document.querySelector("#orangeUseCustomColors"),
  orangePrimaryColorPicker: document.querySelector("#orangePrimaryColorPicker"),
  orangePrimaryColor: document.querySelector("#orangePrimaryColor"),
  orangeSecondaryColorPicker: document.querySelector("#orangeSecondaryColorPicker"),
  orangeSecondaryColor: document.querySelector("#orangeSecondaryColor"),
  seriesLength: document.querySelector("#seriesLength"),
  blueSeriesWins: document.querySelector("#blueSeriesWins"),
  orangeSeriesWins: document.querySelector("#orangeSeriesWins"),
  focusedPlayerId: document.querySelector("#focusedPlayerId"),
  toggleFocusButton: document.querySelector("#toggleFocusButton"),
  previewGoalButton: document.querySelector("#previewGoalButton"),
  selectedHint: document.querySelector("#selectedHint"),
  selectedModuleName: document.querySelector("#selectedModuleName"),
  selectedForm: document.querySelector("#selectedForm"),
  moduleX: document.querySelector("#moduleX"),
  moduleY: document.querySelector("#moduleY"),
  moduleW: document.querySelector("#moduleW"),
  moduleH: document.querySelector("#moduleH"),
  moduleTeamSetting: document.querySelector("#moduleTeamSetting"),
  moduleTeam: document.querySelector("#moduleTeam"),
  moduleFontFamily: document.querySelector("#moduleFontFamily"),
  moduleFontScale: document.querySelector("#moduleFontScale"),
  moduleFontScaleValue: document.querySelector("#moduleFontScaleValue"),
  moduleTextColorPicker: document.querySelector("#moduleTextColorPicker"),
  moduleTextColor: document.querySelector("#moduleTextColor"),
  moduleAccentColorPicker: document.querySelector("#moduleAccentColorPicker"),
  moduleAccentColor: document.querySelector("#moduleAccentColor"),
  moduleBackgroundOpacity: document.querySelector("#moduleBackgroundOpacity"),
  moduleBackgroundOpacityValue: document.querySelector("#moduleBackgroundOpacityValue"),
  resetModuleAppearanceButton: document.querySelector("#resetModuleAppearanceButton"),
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function teamName(team) {
  const meta = state.overlay?.meta || {};
  return team === 1 ? meta.orangeName || "Orange Esports" : meta.blueName || "BlueWave";
}

function teamShort(team) {
  const fallback = team === 1 ? "ORG" : "BLW";
  const name = teamName(team)
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (name.length > 1) {
    return name.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
  }

  return name[0]?.slice(0, 3).toUpperCase() || fallback;
}

function teamLogoMarkup(team) {
  const meta = state.overlay?.meta || {};
  const url = team === 1 ? meta.orangeLogoUrl : meta.blueLogoUrl;

  if (url) {
    return `<img src="${escapeHtml(url)}" alt="" />`;
  }

  return escapeHtml(teamShort(team)[0] || (team === 1 ? "O" : "B"));
}

function moduleTeam(module) {
  if (module.type === "roster" || module.type === "detailedRoster" || module.type === "teamTotals") {
    return Number(module.settings?.team || 0);
  }

  return 0;
}

function fallbackPlayers(team) {
  const short = teamShort(team);
  const names = team === 1 ? ["Zen", "Rizzo", "Flux"] : ["Alpha", "Beta", "Charlie"];
  return names.map((name, index) => ({
    Name: `${short} ${name}`,
    Boost: 100,
    Score: [412, 366, 274, 398, 316, 228][team * 3 + index],
    Goals: index === 0 ? 1 : 0,
    Assists: index === 1 ? 1 : 0,
    Saves: index + 2,
    Shots: 3 - Math.min(index, 2),
    Demos: index === 2 ? 1 : 0,
    Ping: 24 + index * 4,
  }));
}

function teamPlayers(team) {
  const players = state.players.filter((player) => Number(player.TeamNum) === team);
  return (players.length ? players : fallbackPlayers(team)).slice(0, 3);
}

function playerValue(player, key, fallback = 0) {
  const value = Number(player?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function seriesDots(team) {
  const meta = state.overlay?.meta || {};
  const dotCount = Math.max(1, Number(meta.seriesLength || 5));
  const wins = Number(team === 1 ? meta.orangeSeriesWins || 0 : meta.blueSeriesWins || 0);

  return Array.from({ length: dotCount }, (_, index) => {
    const isWon = team === 1 ? index >= dotCount - wins : index < wins;
    return `<i class="${isWon ? "is-won" : ""}"></i>`;
  }).join("");
}

function scoreboardPreview() {
  const meta = state.overlay?.meta || {};
  const dotCount = Math.max(1, Number(meta.seriesLength || 5));
  const blueWins = Number(meta.blueSeriesWins || 0);
  const orangeWins = Number(meta.orangeSeriesWins || 0);
  const game = Math.min(blueWins + orangeWins + 1, dotCount);

  return `
    <section class="mock-scorebug">
      <div class="mock-scorebug-badge">Scoreboard</div>
      <div class="mock-logo mock-logo-blue">${teamLogoMarkup(0)}</div>
      <div class="mock-name mock-name-blue">${escapeHtml(teamName(0))}</div>
      <div class="mock-score mock-score-blue">2</div>
      <div class="mock-clock">3:24</div>
      <div class="mock-score mock-score-orange">1</div>
      <div class="mock-name mock-name-orange">${escapeHtml(teamName(1))}</div>
      <div class="mock-logo mock-logo-orange">${teamLogoMarkup(1)}</div>
      <div class="mock-series mock-series-blue">${seriesDots(0)}</div>
      <div class="mock-game-label">Game ${game} | Best of ${dotCount}</div>
      <div class="mock-series mock-series-orange">${seriesDots(1)}</div>
    </section>
  `;
}

function rosterPreview(team) {
  const rows = teamPlayers(team)
    .map(
      (player) => `
        <p>
          <span>${escapeHtml(player.Name || "Player")}</span>
          <strong>${playerValue(player, "Boost", 100)}</strong>
        </p>
      `,
    )
    .join("");

  return `
    <section class="mock-roster">
      <h3>${team === 1 ? "Orange" : "Blue"} Roster</h3>
      ${rows}
    </section>
  `;
}

function detailedRosterPreview(team) {
  const rows = teamPlayers(team)
    .map(
      (player, index) => `
        <div class="mock-stat-row">
          <span>${escapeHtml(player.Name || "Player")}</span>
          <b>${playerValue(player, "Score", 300 - index * 40)}</b>
          <b>${playerValue(player, "Goals", index === 0 ? 1 : 0)}</b>
          <b>${playerValue(player, "Assists", index === 1 ? 1 : 0)}</b>
          <b>${playerValue(player, "Shots", 3 - Math.min(index, 2))}</b>
          <b>${playerValue(player, "Saves", index + 2)}</b>
          <em>+${playerValue(player, "Ping", 24 + index * 4)}</em>
        </div>
      `,
    )
    .join("");

  return `
    <section class="mock-detail">
      <h3>${team === 1 ? "Orange" : "Blue"} Detailed Roster</h3>
      ${rows}
    </section>
  `;
}

function teamTotalsPreview() {
  return `
    <section class="mock-totals">
      <h3>Team Totals</h3>
      <div><strong>7</strong><span>Shots</span></div>
      <div><strong>4</strong><span>Saves</span></div>
      <div><strong>2</strong><span>Demos</span></div>
      <div class="mock-divider"></div>
      <div><strong>7</strong><span>Shots</span></div>
      <div><strong>4</strong><span>Saves</span></div>
      <div><strong>2</strong><span>Demos</span></div>
    </section>
  `;
}

function focusedPlayerPreview() {
  const player = teamPlayers(0)[0];
  return `
    <section class="mock-focus">
      <div class="mock-avatar">*</div>
      <div class="mock-focus-main">
        <h3>Focused Player</h3>
        <strong>${escapeHtml(player.Name || "BLW Alpha")}</strong>
        <span>${escapeHtml(teamName(0))}</span>
      </div>
      <div class="mock-focus-stat"><small>Score</small><b>${playerValue(player, "Score", 412)}</b></div>
      <div class="mock-focus-stat"><small>Goals</small><b>${playerValue(player, "Goals", 1)}</b></div>
      <div class="mock-focus-stat"><small>Assists</small><b>${playerValue(player, "Assists", 0)}</b></div>
      <div class="mock-focus-stat"><small>Saves</small><b>${playerValue(player, "Saves", 2)}</b></div>
      <div class="mock-focus-stat"><small>Shots</small><b>${playerValue(player, "Shots", 3)}</b></div>
    </section>
  `;
}

function ballSpeedPreview() {
  return `
    <section class="mock-speed">
      <h3>Ball Speed</h3>
      <div class="mock-gauge"></div>
      <strong>78</strong>
      <span>MPH</span>
    </section>
  `;
}

function modulePreviewHtml(module) {
  const team = moduleTeam(module);

  if (module.type === "scoreboard") return scoreboardPreview();
  if (module.type === "roster") return rosterPreview(team);
  if (module.type === "detailedRoster") return detailedRosterPreview(team);
  if (module.type === "teamTotals") return teamTotalsPreview();
  if (module.type === "focusedPlayer") return focusedPlayerPreview();
  if (module.type === "ballSpeed") return ballSpeedPreview();

  return `<section class="mock-panel"><h3 class="mock-title">${escapeHtml(moduleLabel(module))}</h3></section>`;
}

function snap(value) {
  return Math.round(value / gridSize) * gridSize;
}

function normalizeColorInput(value, fallback) {
  const raw = String(value || "").trim();
  const hex = raw.replace(/^#/, "");

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.split("").map((digit) => digit + digit).join("").toLowerCase()}`;
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }

  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);

  if (rgb) {
    const channels = rgb.slice(1, 4).map((channel) => Number(channel));
    if (channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    }
  }

  return fallback;
}

function setColorControl(textInput, pickerInput, value) {
  const color = normalizeColorInput(value, pickerInput.value || "#ffffff");
  textInput.value = color;
  pickerInput.value = color;
}

function setOptionalColorControl(textInput, pickerInput, value, fallback) {
  const raw = String(value || "").trim();

  if (!raw) {
    textInput.value = "";
    pickerInput.value = fallback;
    return;
  }

  const color = normalizeColorInput(raw, fallback);
  textInput.value = color;
  pickerInput.value = color;
}

function moduleAppearance(module) {
  module.settings = module.settings || {};
  module.settings.appearance = module.settings.appearance || {};
  return module.settings.appearance;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
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
  const moduleRows = [
    { label: "Scoreboard", modules: state.overlay.modules.filter((module) => module.type === "scoreboard") },
    { label: "Team Rosters", modules: state.overlay.modules.filter((module) => module.type === "roster") },
    { label: "Detailed Rosters", modules: state.overlay.modules.filter((module) => module.type === "detailedRoster") },
    { label: "Focused Player", modules: state.overlay.modules.filter((module) => module.type === "focusedPlayer") },
    { label: "Team Totals", modules: state.overlay.modules.filter((module) => module.type === "teamTotals") },
    { label: "Stats (Ball Speed)", modules: state.overlay.modules.filter((module) => module.type === "ballSpeed") },
  ].filter((entry) => entry.modules.length > 0);

  for (const entry of moduleRows) {
    const module = entry.modules.find((item) => isSelected(item.id)) || entry.modules[0];
    const anyVisible = entry.modules.some((item) => item.visible);
    const row = document.createElement("div");
    row.className = "module-row";
    row.dataset.selected = entry.modules.some((item) => isSelected(item.id));
    row.dataset.visible = anyVisible;
    row.innerHTML = `
        <button class="module-select" type="button">
          <strong>${entry.label}</strong>
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
        <strong class="module-state">${anyVisible ? "ON" : "OFF"}</strong>
        <button class="visibility-toggle" type="button" aria-label="${anyVisible ? "Hide" : "Show"} ${entry.label}" title="${anyVisible ? "Hide" : "Show"}">
          ${eyeIcon(anyVisible)}
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
      setModulesVisible(entry.modules, !anyVisible);
      if (!anyVisible) {
        selectModule(module.id);
      } else {
        for (const item of entry.modules) {
          state.selectedIds.delete(item.id);
        }
        if (entry.modules.some((item) => item.id === state.selectedId)) {
          state.selectedId = state.selectedIds.values().next().value || null;
        }
        render();
      }
      markDirty();
    });
    elements.moduleList.append(row);
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
    node.dataset.type = module.type;
    node.dataset.team = moduleTeam(module) === 1 ? "orange" : "blue";
    node.dataset.selected = isSelected(module.id);
    node.dataset.visible = module.visible;
    node.dataset.toolsPlacement = module.y * ratio < 38 ? "bottom" : "top";
    node.style.left = `${module.x * ratio}px`;
    node.style.top = `${module.y * ratio}px`;
    node.style.width = `${module.w * ratio}px`;
    node.style.height = `${moduleDisplayHeight(module) * ratio}px`;
    node.innerHTML = `<span class="selection-label">${escapeHtml(moduleLabel(module))}</span>`;
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
  elements.blueLogoUrl.value = meta.blueLogoUrl || "";
  elements.orangeName.value = meta.orangeName || "";
  elements.orangeLogoUrl.value = meta.orangeLogoUrl || "";
  elements.blueTeamFontScale.value = meta.blueTeamFontScale || 100;
  elements.orangeTeamFontScale.value = meta.orangeTeamFontScale || 100;
  elements.blueUseCustomColors.checked = Boolean(meta.blueUseCustomColors);
  setColorControl(elements.bluePrimaryColor, elements.bluePrimaryColorPicker, meta.bluePrimaryColor || "#168cff");
  setColorControl(elements.blueSecondaryColor, elements.blueSecondaryColorPicker, meta.blueSecondaryColor || "#dff1ff");
  elements.orangeUseCustomColors.checked = Boolean(meta.orangeUseCustomColors);
  setColorControl(elements.orangePrimaryColor, elements.orangePrimaryColorPicker, meta.orangePrimaryColor || "#ff8f1f");
  setColorControl(elements.orangeSecondaryColor, elements.orangeSecondaryColorPicker, meta.orangeSecondaryColor || "#fff0df");
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
  elements.selectedModuleName.textContent = module ? moduleLabel(module) : "None";

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

  const appearance = module.settings?.appearance || {};
  const fontScale = clampNumber(appearance.fontScale, 60, 160, 100);
  const backgroundOpacity = clampNumber(appearance.backgroundOpacity, 30, 100, 100);
  elements.moduleFontFamily.value = appearance.fontFamily || "";
  elements.moduleFontScale.value = fontScale;
  elements.moduleFontScaleValue.textContent = `${fontScale}%`;
  setOptionalColorControl(elements.moduleTextColor, elements.moduleTextColorPicker, appearance.textColor, "#ffffff");
  setOptionalColorControl(elements.moduleAccentColor, elements.moduleAccentColorPicker, appearance.accentColor, "#0062ff");
  elements.moduleBackgroundOpacity.value = backgroundOpacity;
  elements.moduleBackgroundOpacityValue.textContent = `${backgroundOpacity}%`;
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
    blueLogoUrl: elements.blueLogoUrl.value.trim(),
    orangeName: elements.orangeName.value,
    orangeLogoUrl: elements.orangeLogoUrl.value.trim(),
    blueTeamFontScale: Number(elements.blueTeamFontScale.value || 100),
    orangeTeamFontScale: Number(elements.orangeTeamFontScale.value || 100),
    blueUseCustomColors: elements.blueUseCustomColors.checked,
    bluePrimaryColor: normalizeColorInput(elements.bluePrimaryColor.value, "#168cff"),
    blueSecondaryColor: normalizeColorInput(elements.blueSecondaryColor.value, "#dff1ff"),
    orangeUseCustomColors: elements.orangeUseCustomColors.checked,
    orangePrimaryColor: normalizeColorInput(elements.orangePrimaryColor.value, "#ff8f1f"),
    orangeSecondaryColor: normalizeColorInput(elements.orangeSecondaryColor.value, "#fff0df"),
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

function updateSelectedAppearance() {
  const module = selectedModule();

  if (!module) {
    return;
  }

  const appearance = moduleAppearance(module);
  const fontFamily = elements.moduleFontFamily.value;
  const textColor = String(elements.moduleTextColor.value || "").trim();
  const accentColor = String(elements.moduleAccentColor.value || "").trim();

  if (fontFamily) {
    appearance.fontFamily = fontFamily;
  } else {
    delete appearance.fontFamily;
  }

  appearance.fontScale = clampNumber(elements.moduleFontScale.value, 60, 160, 100);
  appearance.backgroundOpacity = clampNumber(elements.moduleBackgroundOpacity.value, 30, 100, 100);

  if (textColor) {
    appearance.textColor = normalizeColorInput(textColor, "#ffffff");
    setOptionalColorControl(elements.moduleTextColor, elements.moduleTextColorPicker, appearance.textColor, "#ffffff");
  } else {
    delete appearance.textColor;
    setOptionalColorControl(elements.moduleTextColor, elements.moduleTextColorPicker, "", "#ffffff");
  }

  if (accentColor) {
    appearance.accentColor = normalizeColorInput(accentColor, "#0062ff");
    setOptionalColorControl(elements.moduleAccentColor, elements.moduleAccentColorPicker, appearance.accentColor, "#0062ff");
  } else {
    delete appearance.accentColor;
    setOptionalColorControl(elements.moduleAccentColor, elements.moduleAccentColorPicker, "", "#0062ff");
  }

  elements.moduleFontScaleValue.textContent = `${appearance.fontScale}%`;
  elements.moduleBackgroundOpacityValue.textContent = `${appearance.backgroundOpacity}%`;
  markDirty();
}

function resetSelectedAppearance() {
  const module = selectedModule();

  if (!module?.settings?.appearance) {
    return;
  }

  delete module.settings.appearance;
  renderSelectedForm();
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

async function uploadTeamLogo(fileInput, urlInput) {
  const file = fileInput.files?.[0];

  if (!file) {
    return;
  }

  const dataUrl = await fileAsDataUrl(file);
  const response = await fetch("./api/team-logo-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, dataUrl }),
  });

  if (!response.ok) {
    fileInput.value = "";
    return;
  }

  const result = await response.json();
  urlInput.value = result.url || "";
  fileInput.value = "";
  updateMeta();
}

function clearTeamLogo(urlInput, fileInput) {
  urlInput.value = "";
  fileInput.value = "";
  updateMeta();
}

[
  elements.blueName,
  elements.blueLogoUrl,
  elements.orangeName,
  elements.orangeLogoUrl,
  elements.blueTeamFontScale,
  elements.orangeTeamFontScale,
  elements.blueUseCustomColors,
  elements.orangeUseCustomColors,
  elements.matchTitle,
  elements.seriesLength,
  elements.blueSeriesWins,
  elements.orangeSeriesWins,
  elements.focusedPlayerId,
].forEach((input) => input.addEventListener("input", updateMeta));

elements.blueLogoUpload.addEventListener("change", () => uploadTeamLogo(elements.blueLogoUpload, elements.blueLogoUrl));
elements.orangeLogoUpload.addEventListener("change", () =>
  uploadTeamLogo(elements.orangeLogoUpload, elements.orangeLogoUrl),
);
elements.clearBlueLogoButton.addEventListener("click", () =>
  clearTeamLogo(elements.blueLogoUrl, elements.blueLogoUpload),
);
elements.clearOrangeLogoButton.addEventListener("click", () =>
  clearTeamLogo(elements.orangeLogoUrl, elements.orangeLogoUpload),
);

[
  [elements.bluePrimaryColorPicker, elements.bluePrimaryColor],
  [elements.blueSecondaryColorPicker, elements.blueSecondaryColor],
  [elements.orangePrimaryColorPicker, elements.orangePrimaryColor],
  [elements.orangeSecondaryColorPicker, elements.orangeSecondaryColor],
].forEach(([picker, text]) => {
  picker.addEventListener("input", () => {
    text.value = picker.value;
    updateMeta();
  });

  text.addEventListener("change", () => {
    setColorControl(text, picker, text.value);
    updateMeta();
  });
});

[
  elements.moduleX,
  elements.moduleY,
  elements.moduleW,
  elements.moduleH,
  elements.moduleTeam,
].forEach((input) => input.addEventListener("input", updateSelectedModule));

[
  elements.moduleFontFamily,
  elements.moduleFontScale,
  elements.moduleBackgroundOpacity,
].forEach((input) => input.addEventListener("input", updateSelectedAppearance));

[
  [elements.moduleTextColorPicker, elements.moduleTextColor],
  [elements.moduleAccentColorPicker, elements.moduleAccentColor],
].forEach(([picker, text]) => {
  picker.addEventListener("input", () => {
    text.value = picker.value;
    updateSelectedAppearance();
  });

  text.addEventListener("change", updateSelectedAppearance);
});

elements.resetModuleAppearanceButton.addEventListener("click", resetSelectedAppearance);
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
