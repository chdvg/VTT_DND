# D&D VTT Control Console (v2.0 — Web Edition)

A browser-based virtual tabletop (VTT) for Dungeons & Dragons. The DM runs a Node.js server on their machine; everyone else — players, a projector, a tablet — connects via any web browser on the local network. No Electron, no installs on client devices.

> **Previous version (Electron):** tagged `v1.0-electron` / `v1.0` in this repo.

---

## How It Works

| Who | URL | What they see |
|-----|-----|---------------|
| DM | `http://localhost:3000` | Full control panel |
| Players / Projector | `http://<server-ip>:3000/remote/player` | Player view (maps, fog, audio, overlays) |

The DM panel and player screen stay in sync via WebSocket. Everything the DM does — showing a map, playing audio, updating fog of war — is pushed to all connected player browsers instantly.

---

## Features

### Maps & Scenes
- **Area › Scene › Map hierarchy** — Organize content as e.g. *Phandalin › Stonehill Inn › Ground Floor*
- **Live search** — Filter maps by area, scene, or map name; filter audio by category or track title
- **Chain navigation** — Each map row has a dropdown to jump-to any other map in the same scene
- **Image fit modes** — Per-map cycling button: 📐 Fit / 🔲 Cover / ⬜ Fill; setting is saved per map
- **Scene Builder** — Create and edit scenes; assign per-map ambience audio, fog toggle, and fit mode; file picker auto-fills image URL

### Fog of War
- Per-map 20×20 grid fog
- DM editor shows the map as background with semi-transparent fog cells overlaid — click to reveal or hide individual cells
- Reveal All / Clear All shortcuts
- Fog state is pushed to player screens in real time; saved per-map in `scenes.json`

### Audio
- Categorized library (grouped by `Category - Title.ext` naming convention)
- Preview tracks locally on the DM machine before broadcasting
- **Loop** or **Once** buttons per track — sends with the correct loop flag to players
- Per-map ambience with a 🔁/▶️ toggle saved on the scene
- **Auto-stop** — audio stops automatically when switching to a new map view
- **⏹ Stop All Audio** — immediately silences both DM previews and all player screens

### Player Screen
- **Tap-to-begin overlay** — full-screen overlay on first load; dismissing it unlocks browser audio autoplay
- **Overlay popups** — dice rolls, initiative order, sent text, and sent images appear as a timed gold-bordered floating panel *over* the map (map stays visible)
- Auto-dismiss timers: Dice 8 s · Initiative 12 s · Text 15 s · Image 20 s

### DM Panel UX
- **Draggable sections** — grab the ⠿ handle on any panel header and drag it to reorder; layout is saved per-browser in `localStorage`
- **Quick Actions** — ⬛ BLACKOUT and 🧹 CLEAR
- **Send Text** — push a labelled text block as a timed overlay to players
- **Send Image** — push any image URL or local file upload as a timed overlay
- **Dice Roller** — d4 through d100; optional broadcast to players
- **Initiative Tracker** — add combatants by name/roll, advance turns, broadcast order to players
- **Connected indicator** — live count of connected player browsers in the header

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

- **DM Panel:** `http://localhost:3000` — password protected
- **Player Screen:** `http://<your-ip>:3000/remote/player` — open to all devices on the network

To find your local IP on Windows:
```
ipconfig
```
Look for **IPv4 Address** under your active adapter (usually `192.168.x.x`).

---

## DM Password

The DM panel is password protected. The default password is:

```
dm1234
```

### Changing the password

**Option 1 — Environment variable (recommended):**
```powershell
$env:DM_PASSWORD="yournewpassword" ; node server.js
```
The password only applies for that server run. Set it every time you start, or add it to a start script.

**Option 2 — Change the default in source:**

Edit line 13 of `server.js`:
```js
const DM_PASSWORD = process.env.DM_PASSWORD || 'dm1234';
```
Replace `dm1234` with your password. Don't commit this to a public repo.

### Logging out
Click the **🔒 Lock** button in the top-right of the DM panel header. This clears your session and redirects back to the login page.

> Sessions are in-memory — restarting the server automatically logs everyone out.

---

## Project Structure

```
├── server.js               # Express + WebSocket server (port 3000)
├── dm/
│   ├── index.html          # DM control panel UI
│   ├── app.js              # DM panel logic (scenes, audio, fog, drag-drop layout)
│   └── styles.css          # DM panel styles
├── remote/
│   ├── player.html         # Player screen layout (tap overlay, popup overlay)
│   └── player.js           # Player screen logic (image, audio, fog, overlays)
├── public/assets/
│   ├── maps/               # Map images (.jpg, .png, .webp, .gif)
│   └── audio/              # Audio files (.mp3, .ogg, .wav)
├── seeds/
│   └── scenes.json         # Scene/view data persisted by the server
└── shared/types/           # Shared TypeScript type definitions
```

---

## Adding Content

### Maps
Drop image files into `public/assets/maps/`. Available immediately in the Scene Builder file picker — no server restart needed.

### Audio
Drop audio files into `public/assets/audio/`. Use the naming convention:

```
Category - Title.mp3
```

Examples: `Battle - Epic Battle.mp3`, `Atmosphere - Tavern Night.mp3`

The server automatically groups them by category in the audio panel.

| Filename | Category | Title |
|----------|----------|-------|
| `Battle - Epic Battle.mp3` | Battle | Epic Battle |
| `Atmosphere - Tavern Night.ogg` | Atmosphere | Tavern Night |
| `Dungeon Ambience.mp3` | *(ungrouped)* | Dungeon Ambience |

---

## Scene Data

Scenes are stored in `seeds/scenes.json`. Structure:

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
        "audioLoop": false,
        "fog": true,
        "fit": "contain"
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
| GET | `/api/audio` | List audio files grouped by category |
| GET | `/api/maps` | List map files |
| POST | `/api/overlay` | Push timed overlay (title, html, duration ms) to players |
| POST | `/api/stopaudio` | Stop audio on all players |
| POST | `/api/blackout` | Toggle blackout on players |
| POST | `/api/clear` | Clear player screen |
| WS | `/ws` | Real-time sync channel |

### WebSocket Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| `SHOW_SCENE_VIEW` | server → player | `{ image, audio, audioLoop, fogKey, fit }` |
| `UPDATE_FOG` | server → player | `{ fogKey, cells }` |
| `PLAY_AUDIO` | server → player | `{ url, loop }` |
| `STOP_AUDIO` | server → player | — |
| `OVERLAY` | server → player | `{ title, data, duration }` |
| `BLACKOUT` | server → player | `{ active }` |

---

## DM Panel Layout

Sections can be reordered by dragging the **⠿** handle in each panel header. The order is saved in `localStorage` per browser. To reset to default, run in the browser console:
```js
localStorage.removeItem('dm-panel-order');
```

Default order:
1. Maps & Audio
2. Quick Actions
3. Scene Builder
4. Send Text
5. Send Image
6. Initiative Tracker
7. Dice Roller

---

## License

MIT
