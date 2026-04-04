# D&D Control Console

A virtual tabletop (VTT) control console for Dungeon and Dragons game play, built with Electron, React, Vite, and TypeScript.

## Features

- **DM Control Panel** — Manage scenes, maps, audio, and fog of war from a single window
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
