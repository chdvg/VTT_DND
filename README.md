# D&D VTT Control Console (v2.6 — Web Edition)

A browser-based virtual tabletop (VTT) for Dungeons & Dragons. The DM runs a Node.js server on their machine; everyone else — players, a projector, a tablet — connects via any web browser on the local network. No Electron, no installs on client devices.

> **Previous version (Electron):** tagged `v1.0-electron` / `v1.0` in this repo.

---

## How It Works

| Who | URL | What they see |
|-----|-----|---------------|
| DM | `http://localhost:3000` | Full control panel |
| Players / Projector | `http://<server-ip>:3000/remote/player` | Player view (maps, fog, audio, overlays) |
| Map Builder | `http://localhost:3000/map-builder` | Tile-based map editor |

The DM panel and player screen stay in sync via WebSocket. Everything the DM does — showing a map, playing audio, updating fog of war — is pushed to all connected player browsers instantly.

---

## Features

### Maps & Scenes
- **Area › Scene › Map hierarchy** — Organize content as e.g. *Phandalin › Stonehill Inn › Ground Floor*
- **Live search** — Filter maps by area, scene, or map name; filter audio by category or track title
- **Chain navigation** — Each map row has a dropdown to jump-to any other map in the same scene
- **Image fit modes** — Per-map cycling button: 📐 Fit / 🔲 Cover / ⬜ Fill; setting is saved per map
- **Scene Builder** — Create and edit scenes; assign per-map ambience audio, fog toggle, and fit mode; file picker auto-fills image URL

### Map Builder
A full tile-based map editor accessible at `/map-builder` from the DM machine (link in the DM panel header).

**Tools:**
| Tool | Description |
|------|-------------|
| 🖌 Paint | Click or drag to paint tiles |
| ⬜ Erase | Remove tiles back to empty |
| 🪣 Fill | Flood-fill an area with the selected tile |
| 🪙 Token | Place player or NPC/enemy tokens |
| 🔤 Label | Add text labels anywhere on the map |
| 🖼 Image | Place a background image behind the tile grid |

**Token tool:**
- **Player tab** — pick a player from your saved roster; their class icon and color are applied automatically
- **NPC tab** — choose from 25 standard mob types (each with a unique icon and color) or enter a custom label; tokens auto-number (e.g. Goblin 1, Goblin 2…)

**Tile palette — 49 procedural tile types across 10 groups, plus 132 Kenney pixel-art tiles:**

| Group | Tiles |
|-------|-------|
| **Ground** | Stone Floor, Wood Floor, Dirt, Cave |
| **Terrain** | Grass, Sand, Snow, Swamp, Lava |
| **Water** | Water, Deep Water |
| **Walls** | Wall, Stone Wall, Ruined Wall, Door, Pit |
| **Buildings** | Cabin, Ruined Cabin, Tent, Well |
| **Roads** | Road ─, Road │, Road +, Road ↗ ↖ ↘ ↙ (corners), Road T-N/S/E/W (11 variants) |
| **Nature** | Tree, Large Tree, Pine, Palm, Hill |
| **Mountains** | Mountain, Scree, Alpine, Earthy, Tundra, Slate |
| **Animals** | Horse, Cow |
| **Effects** | Aura (orange/red/blue), Fire (orange/blue) |
| **Kenney Dungeon** | 132 pixel-art tiles (K-0000 – K-0131) from the [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) pack |

Procedural tiles render from canvas code — no external files. Kenney tiles are served from `public/assets/tiles/` and render with crisp pixel-art scaling (`image-rendering: pixelated`). Both tile types save and restore normally via the `.map.json` format.

> Kenney Tiny Dungeon tileset is released under **CC0 1.0 Universal** (public domain). No attribution required. See [kenney.nl](https://kenney.nl) for more free game assets.

**Grid:** Configurable columns × rows (4–60 × 4–40) and cell size (16–96 px). Changes apply without losing painted tiles.

**Fog of War in the Map Builder:**
- Click **🌫 Fog** to enter fog-painting mode. The fog layer appears as a dark semi-transparent overlay.
- Paint fog cells by clicking/dragging; reveal or hide individual cells.
- **👁 Reveal All** / **🌑 Hide All** shortcuts appear when fog mode is active.
- **📡 Send Live** broadcasts the built map as a PNG to all connected player screens with live fog applied.
- Enemy/mob tokens in fogged cells are automatically hidden from the player view.

**Undo / Clear:** ↩ Undo steps back one paint action; 🗑 Clear resets the entire canvas.

**Saving a Map:** Click **💾 Save Map** to open the save dialog.
- Enter a filename.
- By default, saving does **not** add the map to a scene — check **Add to scene list** only when you want it to appear in the DM panel.
- When adding to a scene, the **Area** and **Scene label** fields are smart dropdowns that show your existing areas/scenes; choose **＋ New…** to create a new one.
- Saving the same image path to an area it already belongs to is silently de-duplicated.
- The map is exported as a PNG and saved to `public/assets/maps/`. A `.map.json` file is saved alongside it preserving the full editable state.

**Opening a Map for Editing:** Click **📂 Open Map** — two tabs:
- **🗂 Builder Maps** — maps saved from the builder (have an editable `.map.json`); restores tiles, tokens, labels, fog, and features exactly.
- **🖼 Any Image** — every image in `public/assets/maps/`; opens it as a background on a blank grid so you can add tiles, features, fog, and overlays on top, then save as a new builder map.

**Map Features (traps, puzzles, reveals):**
- Switch to the **🎯 Feature** tool to define named overlay regions on the map.
- Paint cells onto the map, then click **+ Add Feature from Selection** to open the feature editor.
- Each feature has a **name**, **type** (Pit, Trap, Puzzle, Reveal, Effect), **animation** (Shake & Reveal, Red Flash, Gold Pulse, Fade In, White Flash), **color**, and optional description.
- Features are saved inside the `.map.json` and are invisible on the player screen until triggered.
- In the DM Map Control panel, a **🎯 Map Features** section appears with **⚡ Trigger** and **↩ Reset** buttons per feature.
- Triggering a feature plays its animation and reveals the colored overlay on the player screen; resetting hides it again.

---

### Fog of War (Scene Maps)
- Per-map 20×20 grid fog managed in the Scene Builder
- DM fog editor shows the map as background with semi-transparent fog cells overlaid — click or drag to reveal or hide cells
- Reveal All / Hide All shortcuts
- Fog state is pushed to player screens in real time and saved per-map in `scenes.json`

### Audio
- Categorized library (grouped by `Category - Title.ext` naming convention)
- Preview tracks locally on the DM machine before broadcasting
- **Loop** or **Once** buttons per track — sends with the correct loop flag to players
- Per-map ambience with a 🔁/▶️ toggle saved on the scene
- **Auto-stop** — audio stops automatically when switching to a new map view
- **⏹ Stop All Audio** — immediately silences both DM previews and all player screens

### Player Screen
- **Tap-to-begin overlay** — full-screen overlay on first load; dismissing it unlocks browser audio autoplay
- **Player Login** — on the tap overlay, players choose between *▶ Tap to Begin* (guest / audio-unlock only) or *⚔ Login as Character*:
  - Login shows a dropdown populated from the **Player Roster** (`seeds/players.json`) — the DM controls who appears in the list
  - Selecting a name and clicking *Enter Session* binds that player to their roster character and closes the overlay
  - Login is persisted in `sessionStorage` so a page refresh silently re-binds without prompting again
  - **⚔ Log Off** button appears in the bottom-left corner after login; clicking it releases the binding and returns to the tap overlay
- **Player-controlled token movement** — once logged in, a player can drag their own token on the map:
  - Only the token whose label matches the logged-in player's name is interactive; all other tokens remain locked
  - Supports both mouse drag and touch drag (with scroll suppression on mobile)
  - Drag sends a `move-player-token` WebSocket action; the server validates ownership before updating positions
  - Movement is reflected in real time on every connected screen — player views and the DM Map Control panel all update simultaneously
- **Overlay popups** — dice rolls, initiative order, sent text, and sent images appear as a timed gold-bordered floating panel *over* the map (map stays visible)
- Auto-dismiss timers: Dice 8 s · Initiative 12 s · Text 15 s · Image 20 s
- **Fullscreen button** — ⛶ in the corner; useful for projector displays to hide browser chrome

### Map Control Panel
- **⬛ BLACKOUT** — toggles a solid black overlay that covers the *entire* player screen including any popups. Click again to reveal. Audio stops on blackout.
- **🧹 CLEAR** — dismisses any open popup (initiative, text, image overlay) without disturbing the current scene image or audio.
- Fog of war controls and token/draw overlay tools are embedded directly in this panel when a map is active.

### Initiative Tracker
- Add mobs/NPCs by name and roll; add players from the **Player Roster**
- **Player Roster** — persistent list of players stored in `seeds/players.json`. Add/remove players once; they persist across server restarts.
- **Add All Players to Round** — rolls for all rostered players and adds them to the current round in one click.
- PC entries show a **PC** badge in the initiative list so you can distinguish players from mobs at a glance.
- **⚔️ Send** — broadcast current order to players.
- **⏭️ Next** — advance turn and broadcast.
- **🧹 Clear Mobs** — removes all mob/NPC entries but keeps PC entries in the list for the next encounter.
- **🔄 Hard Reset** — clears the entire initiative list including players (prompts for confirmation).
- **Persistence** — the current round, turn position, and all entries survive a page refresh (saved to `localStorage`).
- **⚔️ Send** and **⏭️ Next** buttons are always visible in the Initiative Tracker panel.
- **Condition rings on map tokens** — conditions assigned in the tracker automatically drive colored rings on the corresponding map token; rings expire and update as turns advance.

### Monster Lookup

Real-time monster stat block lookup powered by the [Open5e API](https://open5e.com/).

- **Wildcard / partial-name search** — searches by `name__icontains`, so typing `"goblin"` returns Goblin, Goblin Boss, Dust Goblin, Chaos-Spawn Goblin, etc. (up to 20 results)
- When multiple matches are found, clickable result buttons appear — select one to load its full stat block
- Stat block displays: size/type/alignment, AC, HP, speed, ability scores + modifiers, saving throws, skills, immunities/resistances/vulnerabilities, senses, languages, special traits, actions, bonus actions, reactions, and legendary actions
- Results are cached per session to avoid redundant API calls
- Press **Enter** in the search box or click **🔍 Search** to query

> Monster data is provided by **[Open5e](https://open5e.com/)** — an open-source 5e SRD API maintained by the community. All monster stat blocks are drawn from officially licensed SRD content via their free public API at `https://api.open5e.com/`.

### Reference Panel

The Reference panel is a tabbed quick-reference hub for DMs, with live API lookups for game content.

**⚔️ Conditions tab**
- **Active Conditions chart** — shows each combatant currently in initiative and any conditions assigned to them at a glance
- **Condition Dictionary** — filterable reference for all standard 5e conditions with advantage/disadvantage, auto-fail, and speed penalty notes
- **Custom conditions** — add homebrew conditions with name, type (buff/debuff), and notes
- **Drag-and-drop conditions** — drag any condition row directly onto an initiative tracker entry or a token dot on the map to apply it; a popup appears to set the number of rounds (or mark as permanent ∞); condition rings update instantly on both the DM view and player screen

**📊 Rules tab** — static quick-reference tables (no internet required):
- Difficulty Class (DC) scale (5–30)
- Attack & hit rules (crits, nat 1, advantage/disadvantage situations, flanking, two-weapon fighting)
- Cover bonuses (half, three-quarters, full)
- Concentration & spellcasting rules
- Common item costs (torches, potions, spell material components, etc.)

**✨ Spells tab** — live spell lookup via the [Open5e API](https://open5e.com/):
- Search by name and/or filter by spell level (Cantrip–9th)
- Returns level, school, casting time, range, duration, concentration/ritual flags, source document, and full description
- All content is openly licensed OGL/CC material; each card shows its source document

**💰 Items tab** — live item lookup via the [Open5e API](https://open5e.com/):
- Switch between **Weapons & Armor** and **Magic Items**
- Weapons show category, cost, damage dice, damage type, weight, and special properties; armor shows AC, cost, weight, and stealth disadvantage flag
- Magic items show type, rarity, attunement requirements, and full description
- Uses Open5e `/v1/weapons/` and `/v1/armor/` endpoints (searches both in parallel and merges results); magic items use `/v1/magicitems/`
- All results include source document badge (e.g. 📖 5e Core Rules)

**🎯 Feats tab** — live feat lookup via the [Open5e API](https://open5e.com/) (falls back to the [D&D 5e SRD API](https://www.dnd5eapi.co/)):
- Search by feat name; returns prerequisite and full description

**🔍 Global search bar** — type a term, pick a category (Spells / Items / Feats / Conditions), press Go — automatically switches to the correct tab and fires the search.

> Reference lookup data (spells, items, feats) is provided by **[Open5e](https://open5e.com/)** — a community-maintained open-source API serving only OGL and Creative Commons licensed 5e content. All data is free to use. API endpoint: `https://api.open5e.com/v1/`. Feat fallback provided by the **[D&D 5e SRD API](https://www.dnd5eapi.co/)** at `https://www.dnd5eapi.co/api/`.

### Token Overlay

- Place colored token markers directly on any scene map in the DM panel
- Color codes: 🔴 Enemy · 🔵 Friend · 🟡 Unknown · 🟢 Player
- **Class icons** — player tokens automatically display a class emoji (🗡️ Rogue, 🛡️ Fighter, 🔮 Sorcerer, etc.) and a unique class color drawn from the player roster
- **Mob type icons** — 25 standard monster types (Goblin 👺, Dragon 🐉, Skeleton 💀, Vampire 🧛, etc.) each with a distinct color; auto-numbering labels each placed token (Goblin 1, Goblin 2…)
- **Condition rings** — when a combatant in the initiative tracker has active buffs or debuffs, their map token displays colored rings: 🟢 green for buffs, 🔴 red for debuffs; multiple conditions stack as concentric rings outward
  - Rings update instantly when conditions are added, removed, or expire on turn advance
  - Token list below the map shows condition badges with icon, name, and rounds remaining
  - **💫 Rings: ON/OFF toggle** — show or hide condition rings on the player/projector screen without affecting the DM map view
- **Mob type picker** — choose a standard mob type from a dropdown or enter a custom name; looking up a mob type can auto-pull its stat block from the Monster Lookup
- **Auto-add to initiative** — toggle to automatically add a placed token to the current initiative round
- **Add Party (one-click placement)** — when 🟢 Player color is active, click **🧑‍🤝‍🧑 Add Party** then click anywhere on the map to place all party members in a compact grid centered on that point with no overlapping; existing tokens are moved rather than duplicated
- Tokens persist per map-key in state; drag tokens to reposition or click ✕ to remove
- **Send Live** broadcasts the current map with all tokens overlaid to player screens
- **Real-time player movement** — when a logged-in player drags their own token, the DM Map Control panel updates instantly alongside all player screens; no manual resend needed

### Annotations & Drawing

- Freehand draw annotations directly on the active map in the DM panel
- Choose pen color and stroke width; drawn lines appear as an overlay layer over the map and tokens
- Annotations are cleared when loading a new map or on **🗑 Clear**
- Useful for circling points of interest or drawing attention live during play

### DM Panel UX
- **Draggable sections** — grab the ⠿ handle on any panel header and drag it to reorder; layout is saved per-browser in `localStorage`
- **Send Text** — push a labelled text block as a timed overlay to players
- **Send Image** — push any image URL or local file upload as a timed overlay
- **Dice Roller** — d4 through d100; optional broadcast to players
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
│   ├── app.js              # DM panel logic (scenes, audio, fog, initiative, drag-drop layout)
│   └── styles.css          # DM panel styles
├── map-builder/
│   ├── index.html          # Map Builder UI (tools, palette, grid controls)
│   ├── builder.js          # Map Builder logic (tile paint, fog, undo, save/send)
│   └── styles.css          # Map Builder styles
├── remote/
│   ├── player.html         # Player screen layout (tap overlay, login form, popup overlay, blackout overlay)
│   └── player.js           # Player screen logic (login, image, audio, fog, token drag, overlays)
├── public/assets/
│   ├── maps/               # Map images (.jpg, .png, .webp, .gif)
│   └── audio/              # Audio files (.mp3, .ogg, .wav)
├── seeds/
│   ├── scenes.json         # Scene/view data persisted by the server
│   └── players.json        # Player roster (name list) persisted by the server
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
| GET | `/map-builder` | Map Builder |
| GET | `/remote/player` | Player screen |
| GET | `/api/scenes` | Load all scenes |
| POST | `/api/scenes` | Save all scenes |
| GET | `/api/players` | Load player roster |
| POST | `/api/players` | Save player roster |
| GET | `/api/audio` | List audio files grouped by category |
| GET | `/api/maps` | List map files |
| POST | `/api/map-builder/save` | Export map PNG + save editable `.map.json` state |
| GET | `/api/map-builder/states` | List maps with an editable state file |
| GET | `/api/map-builder/state?name=` | Load editable state for a named map |
| POST | `/api/overlay` | Push timed overlay (title, html, duration ms) to players |
| POST | `/api/stopaudio` | Stop audio on all players |
| POST | `/api/blackout` | Toggle blackout overlay on players (solid black over everything) |
| POST | `/api/clear` | Dismiss open popups on players (scene image is preserved) |
| WS | `/ws` | Real-time sync channel |

### WebSocket Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| `SHOW_SCENE_VIEW` | server → player | `{ image, audio, audioLoop, fogKey, fit }` |
| `UPDATE_FOG` | server → player | `{ fogKey, cells }` |
| `PLAY_AUDIO` | server → player | `{ url, loop }` |
| `STOP_AUDIO` | server → player | — |
| `OVERLAY` | server → player | `{ title, data, duration }` |
| `BLACKOUT` | server → player | `{ active: true\|false }` |
| `CLEAR` | server → player | — |

---

## DM Panel Layout

Sections can be reordered by dragging the **⠿** handle in each panel header. The order is saved in `localStorage` per browser. To reset to default, run in the browser console:
```js
localStorage.removeItem('dm-panel-order');
```

Default order:
1. Map Control *(active map, BLACKOUT, CLEAR, fog, tokens, drawing)*
2. Initiative Tracker
3. Reference *(Active Conditions · Condition Dictionary)*
4. Dice Roller
5. Send Text
6. Send Image
7. Monster Lookup
8. Scene Builder

---

## Credits & Acknowledgements

### Monster Data — Open5e

Monster stat blocks are powered by **[Open5e](https://open5e.com/)**, a free and open-source API providing 5th Edition SRD content.

- **API:** `https://api.open5e.com/`
- **GitHub:** [open5e/open5e-api](https://github.com/open5e/open5e-api)
- **License:** Content is drawn from the [Systems Reference Document (SRD)](https://dnd.wizards.com/resources/systems-reference-document) released under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/) by Wizards of the Coast.
- Some monster entries originate from third-party 5e supplements (Tome of Beasts, Creature Codex, etc.) also published through Open5e under their respective licenses.

Many thanks to the Open5e contributors for maintaining this invaluable free resource for the D&D community.

---

## License

MIT
