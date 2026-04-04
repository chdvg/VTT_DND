# D&D VTT Control Console (v2.0 — Web Edition)

A browser-based virtual tabletop (VTT) for Dungeons & Dragons. The DM runs a Node.js server on their machine; everyone else — players, a projector, a tablet — connects via any web browser on the local network. No Electron, no installs on client devices.

> **Previous version (Electron):** tagged `v1.0-electron` / `v1.0` in this repo.

---

## How It Works

| Who | URL | What they see |
|-----|-----|---------------|
| DM | `http://localhost:3000` | Full control panel |
| Players / Projector | `http://<server-ip>:3000/remote/player` | Player view (maps, audio, text) |

The DM panel and player screen stay in sync via WebSocket. Everything the DM does — showing a map, playing audio, updating fog of war — is pushed to all connected player browsers instantly.

---

## Features

- **Scene Management** — Organize content in an *Area › Scene › Map* hierarchy (e.g. Phandalin › Stonehill Inn › Ground Floor)
- **Search** — Live search maps by area, scene, or individual map name; live search audio by category or track title
- **Map Display** — Push any map image to all player screens with one click; images fit to screen
- **Chain Navigation** — Each map has a dropdown to jump to any other map in the same scene
- **Fog of War** — Per-map 20×20 grid fog; click cells to reveal or hide on the player screen in real time
- **Audio** — Categorized ambient/music/SFX library; preview locally before broadcasting; looping playback on player screens; Stop All Audio clears both DM previews and player screens
- **Scene Builder** — Create and edit scenes with multiple maps; assign per-map ambience audio and optional fog; file picker auto-fills the image URL
- **Quick Actions** — BLACKOUT (clear player screen) and CLEAR buttons
- **Send Text** — Push styled text with a gold title to the player screen
- **Send Image** — Push any image URL or local upload to the player screen
- **Dice Roller** — Roll any die; optionally broadcast results to the player screen
- **Initiative Tracker** — Add combatants by name/roll, track turn order, broadcast to players
- **1-connected indicator** — DM panel shows live count of connected player browsers

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install

```bash
npm install
```

### Run

```bash
node server.js
```

Server starts on **port 3000**.

- **DM Panel:** open `http://localhost:3000` in your browser
- **Player Screen:** open `http://<your-ip>:3000/remote/player` on any device on the network

To find your local IP on Windows:
```
ipconfig
```
Look for **IPv4 Address** under your active adapter (usually `192.168.x.x`).

---

## Project Structure

```
├── server.js               # Express + WebSocket server (port 3000)
├── dm/
│   ├── index.html          # DM control panel UI
│   ├── app.js              # DM panel logic (scenes, audio, fog, builder)
│   └── styles.css          # DM panel styles
├── remote/
│   ├── player.html         # Player screen layout
│   └── player.js           # Player screen logic (image, audio, fog, text)
├── public/assets/
│   ├── maps/               # Map images (.jpg, .png, .webp, .gif)
│   └── audio/              # Audio files (.mp3, .ogg, .wav)
│                           # Name format: "Category - Title.mp3" for auto-grouping
├── seeds/
│   └── scenes.json         # Scene data (persisted by the server)
└── shared/types/           # Shared TypeScript type definitions
```

---

## Adding Content

### Maps
Drop image files into `public/assets/maps/`. They become available in the Scene Builder's file picker immediately (no server restart needed).

### Audio
Drop audio files into `public/assets/audio/`. Name files using the convention:

```
Category - Title.mp3
```

Example: `Battle - Epic Battle.mp3`, `Atmosphere - Tavern Night.mp3`

The server automatically groups them by category in the audio panel.

---

## Audio Naming Convention

| Filename | Category shown | Title shown |
|----------|---------------|-------------|
| `Battle - Epic Battle.mp3` | Battle | Epic Battle |
| `Atmosphere - Tavern Night.ogg` | Atmosphere | Tavern Night |
| `Dungeon Ambience.mp3` | *(no category)* | Dungeon Ambience |

---

## Scene Data

Scenes are stored in `seeds/scenes.json` and saved via `POST /api/scenes`. Structure:

```json
[
  {
    "id": "phandalin-stonehill-inn-123",
    "tab": "Phandalin",
    "label": "Stonehill Inn",
    "views": [
      {
        "id": "...-view-0",
        "label": "Ground Floor",
        "image": "/assets/maps/stonehill_ground.png",
        "audio": "/assets/audio/Atmosphere - Tavern Night.mp3",
        "fog": true
      }
    ]
  }
]
```

---

## API Reference

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | DM control panel |
| GET | `/remote/player` | Player screen |
| GET | `/api/scenes` | Load all scenes |
| POST | `/api/scenes` | Save all scenes |
| GET | `/api/audio` | List audio files + categories |
| POST | `/api/show` | Push text/HTML to players |
| POST | `/api/stopaudio` | Stop audio on all players |
| POST | `/api/blackout` | Toggle blackout on players |
| POST | `/api/clear` | Clear player screen |
| WS | `/ws` | Real-time sync channel |

---

## License

MIT

- **Player Display** — Fullscreen second-screen output for maps, text, and video
- **Remote Control** — Control the session from a phone or tablet over LAN
- **Web Player** — Players can view the session on any device via browser
- **Scene Management** — Organize maps, videos, text scenes, and utility screens into layouts
- **Fog of War** — Grid-based fog with per-cell reveal/hide controls
- **Audio** — Ambience, music, and SFX playback with remote controls
- **Initiative Tracker** — Track turn order with roll values and HP, synced across DM console and remote
- **Party Items** — Shared inventory with quantity tracking, synced across all connected devices
- **Session Logging** — Automatic logging of DM actions during a session

## Architecture

| Component | Tech | Port |
|-----------|------|------|
| DM Window | React + Vite (Electron) | 5173 (dev) / 3002 (prod) |
| Player Window | React + Vite (Electron) | 5173 (dev) / 3002 (prod) |
| Remote Server | Express + WebSocket | 3001 |
| Remote UI | Vanilla JS | served via 3001 |
| Web Player | Vanilla JS | served via 3001 |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

This builds the Electron TypeScript, starts the Vite dev server, and launches the Electron app.

- **DM Panel** opens automatically in Electron
- **Player Window** opens fullscreen on a secondary display (or primary if only one)
- **Remote Control** — open `http://<your-ip>:3001` on a phone/tablet
- **Web Player** — open `http://<your-ip>:3001/player` on a TV or another device

### Build & Package

```bash
npm run build
npm run package
```

Produces a Windows installer in the `release/` folder.

## Project Structure

```
├── electron/           # Electron main process
│   ├── main.ts         # App entry, window creation, IPC
│   ├── preload.ts      # Context bridge for renderer
│   ├── remoteServer.ts # Express + WebSocket server (port 3001)
│   ├── rendererServer.ts # Production renderer server (port 3002)
│   ├── storage.ts      # App data persistence
│   └── logger.ts       # Session event logging
├── src/                # React renderer (Vite)
│   ├── dm/             # DM panel entry point
│   ├── player/         # Player display entry point
│   ├── state/          # Shared React state hooks
│   └── types/          # TypeScript type definitions
├── remote/             # LAN remote control & web player (vanilla JS)
│   ├── index.html      # Remote DM control UI
│   ├── app.js          # Remote control logic
│   ├── player.html     # Web player view
│   ├── player.js       # Web player logic
│   └── styles.css      # Remote UI styles
├── public/assets/      # Maps, audio, and utility images
├── seeds/              # Default layout data (e.g. LMoP campaign)
└── shared/types/       # Shared type definitions
```

## LAN Access

To control the session from another device on your network:

1. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Remote Control: `http://<your-ip>:3001`
3. Web Player: `http://<your-ip>:3001/player`

## License

MIT
