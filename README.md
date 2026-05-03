# Rocket League Broadcast Studio 
RLBS - Shoutout SunlessKhan

A local producer-controlled broadcast overlay for Rocket League streams. It reads the Rocket League Stats API, gives a producer a live control panel, and serves a transparent OBS output page.

[Watch the demo on YouTube](https://www.youtube.com/watch?v=7hOhQyc2AQY)
[Watch the new Producer Panel demo on YouTube](https://youtu.be/tZ_D9jxe5f8)

## Features

- Producer panel for live match metadata, module visibility, and layout editing
- Transparent OBS/browser-source output page
- Drag, resize, center, hide, and show overlay modules
- Multi-select movement in the preview canvas with `Shift + click`, drag, and arrow-key nudging
- RLCS-inspired scoreboard with team logos, names, scores, game clock, team-specific series markers, and optional title bar
- Team logo upload or web image URL support for scoreboard logo slots, with stable rendering during live updates
- Custom team primary/accent color overrides with color pickers plus hex or RGB input
- Global Google font selection with per-module and per-scoreboard-element font overrides
- Compact RLCS-style roster modules with player names, boost values, and boost bars
- Separate detailed roster modules with selectable, draggable stat metrics
- Team Totals module for one selected team with team logo, selectable metrics, and independent name/metric sizing
- Focused Player lower-third module with producer-selected fallback and selectable, draggable stat metrics
- Ball speed badge using last-touch team color
- Custom kickoff countdown overlay calibrated to Rocket League's pre-kickoff `3`, `2`, `1`, `GO!` cadence
- Automatic goal celebration screen with scorer name and animated module transitions
- Module groups with group-level and individual visibility toggles
- Output refresh, goal preview, countdown preview, full reset, and OBS output launch controls
- No npm dependencies

## Screenshots

![Rocket League Broadcast Studio producer panel](assets/rlbs-producerpanel-updates.png)

## Requirements

- Rocket League with the Stats API enabled
- Node.js 18 or newer
- OBS, Streamlabs, or another app that supports browser sources

## Rocket League Setup

Before launching Rocket League, edit:

```text
<Rocket League Install Dir>\TAGame\Config\DefaultStatsAPI.ini
```

Set a non-zero packet rate:

```ini
PacketSendRate=30
Port=49123
```

Restart Rocket League after changing this file. The game only reads the Stats API config at startup.

## Quick Start

Install Node.js from:

```text
https://nodejs.org/
```

Then open PowerShell in this project folder and run:

```powershell
npm start
```

Open the producer panel:

```text
http://127.0.0.1:5173/studio.html
```

Add this page as an OBS Browser Source:

```text
http://127.0.0.1:5173/output.html
```

Preview the output page with a generated no-HUD arena frame:

```text
http://127.0.0.1:5173/output.html?previewBackground=1
```

Log output websocket traffic in the browser console:

```text
http://127.0.0.1:5173/output.html?debug=1
```

You can combine both options:

```text
http://127.0.0.1:5173/output.html?previewBackground=1&debug=1
```

Recommended OBS Browser Source size:

```text
Width: 1600
Height: 900
```

Avoid scaling the browser source up in OBS if possible. Scaling a `1600x900` source to a larger canvas can make text and fine lines look soft. For the sharpest output, keep the browser source at the same size as the overlay stage or update the project stage size to your final broadcast resolution.

## Producer Panel Guide

The producer panel is split into a left match/module control panel, a central preview canvas, and a right selected-module editor. The preview canvas embeds the same output renderer used by OBS, so layout and style edits are shown against the real overlay output instead of a separate mock view.

### Match

Use the Match section for stream-level data:

- `Show Focus` / `Hide Focus`: toggles the Focused Player module.
- `Scoreboard Title`: optional title shown above the scoreboard. Leave this blank to hide the title in the output.
- `Global Font`: chooses the default font family for the whole overlay. Individual modules and some scoreboard elements can override this.
- `Blue Team` and `Orange Team`: override team names from the Stats API.
- `Blue/Orange Logo URL`: paste an `https://` image URL or upload a PNG, JPG, WebP, GIF, or SVG logo from the producer panel. Uploaded logos are saved locally under `assets/uploads/` and referenced by the overlay state.
- `Use custom blue/orange colors`: override Rocket League's team colors with producer-selected primary and accent colors. Use the color picker, paste a hex code like `#168cff`, or enter an RGB value like `rgb(22, 140, 255)`.
- `Series`: choose best of 3, 5, or 7.
- `Blue Wins` and `Orange Wins`: controls the scoreboard series markers.
- `Focused Player`: choose a fallback player for the Focused Player module. `Auto` lets the overlay prefer the currently spectated player when the Stats API exposes one.

Team color overrides flow through the scoreboard, roster modules, Team Totals, ball speed badge, focus module, goal celebration, and other team-colored overlay surfaces. Leave custom colors disabled to use the colors reported by Rocket League.

If a logo upload returns `404`, restart the local Node server. The upload endpoint is served by `server.js`, so an already-running server process needs a restart after pulling or editing that route.

### Modules

Modules are grouped by purpose:

- `Core`: scoreboard and ball speed
- `Compact Rosters`: small RLCS-style name/boost rosters
- `Detailed Rosters`: larger stat-card roster modules
- `Stats`: Team Totals
- `Focus`: Focused Player lower third

Each group has an eye toggle to show or hide the whole group. Each module row also has its own eye toggle for individual visibility.

Hidden modules are removed from the preview canvas so unused modules do not clutter the editor. If you select a hidden module from the list, it appears as a dashed placement ghost so you can edit or reposition it.

The Team Totals row includes a `Blue/Orange` selector in the module list. This chooses which team the Team Totals module highlights.

Most control groups can be collapsed with the chevron button in the section header. This keeps the producer panel usable once you have a lot of module-specific settings open.

### Preview Canvas

The preview canvas represents a `1600x900` overlay stage and mirrors the eventual OBS output.

- Click a module box to select it.
- Click the empty canvas background to deselect the active module.
- Drag a selected module box to move it.
- Drag the bottom-right corner handle to resize it.
- Press the arrow keys to move the highlighted module one grid box at a time.
- `Shift + click` a module box to add or remove it from the highlighted selection.
- Drag any highlighted module to move the selected group together.
- Press the arrow keys with multiple modules highlighted to nudge the whole group one grid box.
- Click the floating `H` button to center the module horizontally.
- Click the floating `V` button to center the module vertically.
- Compact and detailed roster modules include a floating `S` button to match the other roster of the same type.

Resize is intentionally single-module only.

### Selected

The Selected section shows numeric controls for the primary selected module:

- `X` and `Y`: module position on the 1600x900 stage
- `Width` and `Height`: module dimensions
- `Team`: appears for Team Totals and controls which team is highlighted
- `Font Family`: overrides the global font for the selected module when applicable
- `Text Color`, `Accent Color`, and `Panel Opacity`: module-level appearance controls

When multiple modules are selected, this panel still edits the most recently selected module.

Scoreboard modules replace the generic text controls with a `Scoreboard Element` editor. Choose `Title`, `Team Names`, `Scores`, `Clock`, or `Series Label` to adjust that element's font family, size, and color. When `Team Names` is selected, separate `Blue Name Size` and `Orange Name Size` sliders appear; these affect only the scoreboard team names, not Team Totals.

The `Scoreboard Layout` editor includes `Team Name Area`, which expands the team name plates outward from the clock and pushes the logo slots farther out.

Team Totals modules include a `Team Totals Layout` editor:

- `Team Name Panel`: changes the width of the logo/name area.
- `Team Name Size`: changes the team name size for that Team Totals module only.
- `Metric Size`: changes the stat label and number size for that Team Totals module only.

Detailed Roster, Focused Player, and Team Totals modules include metric selectors. Check a metric to show it, uncheck it to hide it, and drag the handle on the left of each metric row to reorder the output.

### Actions

- `Save Layout`: immediately saves the current overlay state.
- `Reset Defaults`: restores the default layout and module settings.
- `Preview Goal`: sends a sample goal celebration to open output pages.
- `Preview Countdown`: sends the custom kickoff countdown animation to open output pages.
- `Open OBS Output`: opens the transparent output page in a new tab.
- `Refresh Output`: appears in the Output Controls section and tells OBS/browser output pages to refresh.

Most producer changes auto-save after a short delay. Use `Save Layout` when you want to force a save immediately.

## Overlay Modules

### Scoreboard

Shows team logos, team names, current score, game clock, team-specific series markers, and an optional title bar. The title is controlled by `Scoreboard Title` in the producer panel and is hidden when blank.

The current scoreboard layout is inspired by modern RLCS broadcasts: logos sit outside the team name plates, scores sit beside the central clock, and the series state is shown below the scorebug as team-colored marker bars with a centered `GAME X | BEST OF Y` label.

The game clock freezes during pre-kickoff countdown, goal replays, pauses, and match-end states, then resumes live ticking when the Stats API reports active play.

Team logos can come from either a web URL or a local upload. Local uploads are copied into `assets/uploads/`, which is ignored by git so each producer can keep their own local logo set. The overlay preserves unchanged logo image nodes during live redraws to avoid flicker in OBS.

Custom team colors include a primary and accent color for each side. When enabled, those colors override Rocket League's reported team colors throughout the overlay.

The selected-module editor can tune the scoreboard by element:

- `Title`: optional top text above the scorebug.
- `Team Names`: team name font, color, and separate blue/orange name sizes.
- `Scores`: score tile number styling.
- `Clock`: central game clock styling.
- `Series Label`: `GAME X | BEST OF Y` styling.

For best-of series markers, the scoreboard shows the number of wins needed per side: best of 3 shows two boxes per side, best of 5 shows three boxes per side, and best of 7 shows four boxes per side.

### Compact Rosters

Small side roster modules designed to sit near the scoreboard. They show:

- Player name
- Numeric boost
- Thin horizontal boost bar
- Active/spectated player name highlight when available

### Detailed Rosters

Larger roster modules for stat-heavy moments. Each player card shows:

- Player name
- Boost
- Score
- Goals
- Saves
- Assists
- Demos

Use the Detailed Roster metric selector in the selected-module editor to choose which stat columns appear and drag them into the order you want. The selection is shared by both detailed roster modules so blue and orange stay consistent.

These are separate modules from Compact Rosters, so you can hide compact rosters and show detailed rosters only when needed.

### Team Totals

Highlights one selected team and shows:

- Goals
- Saves
- Assists
- Demos

Use the inline Blue/Orange selector in the Modules list or the selected-module `Team` control to choose the team. The selected-module editor can also adjust the logo/name panel width, team name size, metric size, and visible metric order.

### Focused Player

A lower-third style focused-player module. It prefers the currently spectated player when the Stats API provides that data, then falls back to the producer-selected player.

Use the Focused Player metric selector to choose and reorder the stats shown in the lower third. The producer panel includes sample player data so the module remains editable before a live Rocket League feed is connected.

### Ball Speed

A compact ball speed badge colored by the ball's last-touch team.

### Goal Celebration

When a goal is detected, the normal overlay modules animate out, a large `GOAL` screen animates in with the scoring player name, then the celebration clears after 3 seconds and the regular modules return to their saved positions.

### Kickoff Countdown

When Rocket League reports its pre-kickoff countdown, the output page shows a custom full-screen `3`, `2`, `1` countdown over the broadcast feed. The timing is calibrated against Rocket League's own kickoff countdown cadence so the custom countdown lands with the in-game sequence instead of racing ahead.

The countdown clears automatically when the round starts or when the match moves into replay, pause, or end states.

Use `Preview Countdown` in the top toolbar to trigger the countdown animation without waiting for a live kickoff event.

## OBS Setup

Create a Browser Source with:

```text
URL: http://127.0.0.1:5173/output.html
Width: 1600
Height: 900
```

Suggested OBS settings:

- Enable transparency.
- Keep the normal `output.html` URL in OBS. The `?previewBackground=1` URL is for local browser previewing without the game running.
- Use `?debug=1` only while diagnosing events; it logs Rocket League and overlay websocket messages to the browser console.
- Do not scale the source up if avoidable.
- If the output looks stale after layout changes, click `Refresh Output` in the producer panel.
- If new server-backed features such as logo upload return `404`, stop and restart `npm start`.
- If OBS is still stale, right-click the Browser Source and choose **Refresh cache of current page**.

## Project Views

```text
http://127.0.0.1:5173/
```

Simple launcher page.

```text
http://127.0.0.1:5173/studio.html
```

Producer control panel. Use this outside OBS.

```text
http://127.0.0.1:5173/output.html
```

Clean transparent overlay output. Use this in OBS.

## Local State

The producer layout is saved to:

```text
overlay-state.json
```

That file is ignored by git so each producer can keep their own local layout. A starter copy is included as:

```text
overlay-state.example.json
```

To reset from the producer panel, click `Reset Defaults`.

## Configuration

The app uses these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5173` | Local HTTP port for Studio and OBS output. |
| `RL_STATS_PORT` | `49123` | Rocket League Stats API port from `DefaultStatsAPI.ini`. |

PowerShell example:

```powershell
$env:PORT=5174
$env:RL_STATS_PORT=49124
npm start
```

## Development

Run syntax checks:

```powershell
npm run check
```

Project files:

- `server.js`: local TCP-to-websocket bridge, static server, and producer-state API
- `studio.html`, `studio.js`, `studio.css`: producer control panel and layout editor
- `output.html`, `output.js`, `output.css`: transparent OBS output
- `overlay-state.example.json`: starter producer layout
- `assets/`: visual assets and README images

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Psyonix, Epic Games, or Rocket League. Rocket League is a trademark of its respective owners.
