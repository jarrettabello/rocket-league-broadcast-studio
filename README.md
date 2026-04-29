# Rocket League Broadcast Studio

A local producer-controlled broadcast overlay for Rocket League streams. It reads the Rocket League Stats API, gives a producer a control panel, and serves a transparent OBS output page.

This is the larger broadcast-tool project. If you only want a small ball-speed overlay, use the separate `rocket-league-ball-speed-overlay` repo.

## Features

- Producer control panel for live overlay state
- Transparent OBS output page
- Move, resize, hide, and show overlay modules
- Scoreboard with series dots for best of 3, 5, or 7 and an optional producer title
- Compact team roster modules with player names and live boost meters
- Ball speed module with team-colored animation based on last touch
- Basic, expanded, and focused-player display modes
- Output refresh command for OBS browser sources
- Optional lobby ratings view using a local `mmr.json` file
- No npm dependencies

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

Open the producer panel in your regular browser:

```text
http://127.0.0.1:5173/studio.html
```

Add this page as an OBS Browser Source:

```text
http://127.0.0.1:5173/output.html
```

Recommended OBS Browser Source size:

```text
Width: 1600
Height: 900
```

If OBS does not update after layout changes, use the producer panel's refresh button. If OBS is still stale, right-click the Browser Source and choose **Refresh cache of current page**.

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

```text
http://127.0.0.1:5173/lobby.html
```

Optional lobby ratings view. Rocket League's Stats API does not expose MMR, so this page only shows ratings if you provide a local `mmr.json`.

## Local State

The producer layout is saved to:

```text
overlay-state.json
```

That file is ignored by git so each producer can keep their own layout. A starter copy is included as:

```text
overlay-state.example.json
```

To reset from the producer panel, click **Reset**.

## Lobby Ratings

The official Rocket League Stats API does not expose player MMR in live packets. To show known ratings in the optional lobby view, copy:

```powershell
Copy-Item mmr.example.json mmr.json
```

Then edit `mmr.json` with player names or `PrimaryId` values. `mmr.json` is ignored by git.

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
- `lobby.html`, `lobby.js`, `lobby.css`: optional lobby ratings view
- `overlay-state.example.json`: starter producer layout
- `assets/`: visual assets used by the overlay

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Psyonix, Epic Games, or Rocket League. Rocket League is a trademark of its respective owners.
