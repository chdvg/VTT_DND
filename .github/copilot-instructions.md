# DND_App — Project Knowledge Base

## Architecture
- Pure intranet browser app — **NO Electron** — Node.js + Express + WebSocket
- **Entry point:** `server.js` (port 3000, listens on `0.0.0.0`)
- **Start:** `node server.js` or `Start DnD Server.bat`
- **LAN IP:** 192.168.1.78:3000 (NordVPN must have "Allow LAN Traffic" enabled)
- **Git branches:** dev → stage → main
- **Dependencies:** `express`, `ws` — no DB, state in server memory + persisted to `data/` on disk
- **Persistence:** campaign-specific state written on every mutation; survives restarts. `data/` is in `.gitignore`.

## Served Routes
| URL | Files | Notes |
|-----|-------|-------|
| `/` → DM panel | `dm/index.html`, `dm/app.js`, `dm/styles.css` | Requires DM auth cookie |
| `/scene-builder` | `scene-builder/index.html`, `scene-builder/app.js` | Scene prep tool, requireDm |
| `/map-builder/` | `map-builder/index.html`, `map-builder/builder.js` | Grid map editor |
| `/characters` | `characters/index.html`, `characters/app.js` | Character sheet manager, requireDm |
| `/remote/player` | `remote/player.html`, `remote/player.js` | Player/projector view |
| `/player` | same as above | Alias |
| `/assets/` | `public/assets/` | Maps, audio, tiles |
| `/seeds/` | blocked (403) | players.json, scenes.json, lmop.json |

## Authentication
- Cookie session auth (`dm_token`), `DM_PASSWORD` env var (default: `dm1234`)
- `isDmAuthed(req)`, `dmSessions` Set, `requireDm` middleware
- DM-only WS actions validated server-side
- Player login via `{ action: 'player-login', name, cls }` WS message
- `loggedInPlayers` Map (name → ws), `ws.playerName` set on login

## Campaign System
- Every session runs under a named campaign — there is no "Default" campaign
- On first load (or if no active campaign), a full-screen gate shows:
  - **Existing campaigns:** searchable dropdown — type to filter, click to select
  - **New:** type name + click "+ Create New" to create and switch immediately
- **Campaign data stored in** `data/campaigns/<slug>/`:
  - `state.json`, `event-log.json`, `players.json` (roster), `sessions/`, `encounters/`, `scene-bundles/`
- **Global (shared across all campaigns):** `data/characters.json`, `data/ai-config.json`, `public/assets/`
- `data/campaigns.json` — `{ active: "name"|null, campaigns: ["name1",...] }`
- `switchCampaign(name)` — saves state, resets server state, loads new campaign, broadcasts `CAMPAIGN_SWITCHED` to DM with full embedded state payload
- Server auto-activates first campaign on startup if `active === null`

## Scene Builder (`/scene-builder`)
- Standalone prep page (not in DM panel); link in DM header
- **Left sidebar:** searchable scene list grouped by Area; Edit/Delete per scene
- **Right form:** Area + Scene name + view rows (label, image URL/file picker, audio, fog)
- **Preview panel:** live map preview; auto-previews first map on edit; 👁 Preview button per row
- **Campaign assignment chips:** 🌐 All Campaigns (pins to every campaign) or individual campaign chips
- Drag-and-drop image upload → `POST /api/maps/upload` → fills focused view row
- Scenes saved to `seeds/scenes.json`

## DM Panel Sidebar — Maps Section
- When a campaign is active and has pinned scenes:
  - Shows `📌 CampaignName` header with flat list of view rows (▶ Show, 🎵 icon, 🔁 loop toggle)
  - Tab view is hidden — only pinned scenes shown
  - `▾ Browse all scenes (N)` collapsed fallback for unassigned scenes
- When no pinned scenes: full tab view of all scenes
- Scenes tagged `campaigns: ["__all__"]` pin to top for every campaign

## WebSocket Message Flow
### DM → Server (action)
`show-scene-view`, `update-tokens`, `update-drawing`, `update-fog`, `set-fog-key`, `trigger-feature`, `reset-feature`, `update-features`, `lock-player`, `unlock-player`, `lock-all`, `unlock-all`, `blackout`, `play-audio`, `stop-audio`, `send-overlay`, `update-hp`, `toggle-grid`, `sync-all-tokens`, `trigger-attack`, `dm-set-target`

### Player → Server (action)
`player-login`, `move-player-token`, `player-dice-roll`, `request-sync`, `sync-all-tokens`, `set-target`

### Server → Clients (type)
`SHOW_SCENE_VIEW`, `UPDATE_TOKENS`, `UPDATE_DRAWING`, `UPDATE_FOG`, `SET_FOG_KEY`, `TRIGGER_FEATURE`, `RESET_FEATURE`, `UPDATE_FEATURES`, `OVERLAY`, `DICE_ROLL`, `BLACKOUT`, `CLEAR`, `CLEAR_SCENE`, `PLAY_AUDIO`, `STOP_AUDIO`, `MOVEMENT_LOCK`, `MOVEMENT_LOCK_ALL`, `PLAYER_LOGIN_OK`, `PLAYER_LOGIN_ERR`, `LOGGED_IN_PLAYERS`, `DM_STATE_RESTORE`, `CAMPAIGN_SWITCHED`, `HP_UPDATE`, `SET_TARGET`, `ATTACK_ANIMATION`, `clients`

## Server State Variables (server.js)
### Path variables (all `let`, updated by `setDataDir(dir)` on campaign switch)
`DATA_DIR`, `STATE_FILE`, `STATE_TMP`, `STATE_BACK`, `EVENT_LOG_FILE`, `SESSIONS_DIR`, `ENCOUNTERS_DIR`, `BUNDLES_DIR`, `ROSTER_FILE`

### Global (const, never change)
`BASE_DATA_DIR`, `CAMPAIGNS_DIR`, `CAMPAIGN_META_FILE`, `CHARACTERS_FILE`, `MAPS_META_FILE`, `AI_CONFIG_FILE`

### Runtime state
- `currentSceneView` — full `SHOW_SCENE_VIEW` payload
- `currentTokens` / `currentTokensMapKey` — token array + map key
- `currentDrawing` / `currentDrawingMapKey`
- `currentFogStates` — fogKey → fogGrid
- `currentFeatures` / `currentFeatureStates`
- `currentMapMeta` — `{ cols, rows }`
- `allTokenStates` — mapKey → tokens[] (all maps, persisted)
- `currentHpState` — name → `{ hp, maxHp }`
- `currentTargets` — playerName → targetLabel
- `eventLog[]` — session events, max 2000, saved to `EVENT_LOG_FILE`
- `mapsMeta` — global per-scene metadata `{ sceneId: { tags[], note } }` from `MAPS_META_FILE`
- `activeCampaign` — current campaign name or null
- `loggedInPlayers` Map / `lockedPlayers` Set / `allPlayersLocked` bool
- `clients` Set / `dmClients` Set
- `characterSheets[]` — from global `CHARACTERS_FILE`

## DM Panel (dm/app.js) Key State
- `initiative[]` — `{ name, roll, isPlayer, cls, conditions[], hp?, maxHp?, dead? }`
- `currentTurn` — index into initiative[]
- `tokenState` — mapKey → tokens array (all maps)
- `activeTokenMapKey` / `activeTokenMapUrl`
- `dmMapFeatures` / `dmMapMeta` / `dmTriggeredFeat`
- `loggedInPlayersList` / `playerLockState` / `allPlayersLockedDm`
- `lastSceneViewPayload` — re-pushed on WS reconnect
- `activeCampaignName` — set by `renderCampaignSection()`; used for pinned scenes + recent maps localStorage key
- `playerRoster[]` — `{ name, cls }` per campaign from `ROSTER_FILE`
- `dmCharacterSheets[]` — global character library (all campaigns)
- `charListSelected` Set — selected IDs in Character Quick Setup panel
- `mapsMeta` — cache of global scene tags/notes
- `activeMapTags` Set — currently active tag filters in map sidebar
- `evLogCache[]` — recent event log entries for AI context

## Player View (remote/player.js) Key State
- `myPlayerName` / `myPlayerCls` — set after login; also in sessionStorage
- `myMovementLocked`, `myTarget`, `allTargets`
- `currentTokens` / `currentMapKey`
- `currentFeatures` / `currentMapMeta` / `triggeredFeatures`
- `fogStates` / `currentFogKey`
- `currentDrawing` / `currentImageUrl`
- `_charSheet` / `_reconnectTimer`

## Token System
- Token shape: `{ id, x, y, type:'player'|'mob'|'item', label, color?, cls?, mobType?, itemType?, conditions[], hidden?, dead? }`
- `x`/`y` are 0–1 fractions of rendered image dimensions (letterbox-corrected)
- Player tokens draggable (own token only) unless `myMovementLocked`
- `tok.hidden = true` — DM sees faded + 🙈 + purple border; players don't render it
- `tok.dead = true` — red ✕ overlay on token for all clients
- Item tokens: square shape, gold border, emoji icon, never targetable

## Initiative Tracker
- `initiative.sort()` by roll descending; `currentTurn` advances with `nextInitiativeTurn()`
- Conditions tick per turn (rounds); permanent = `null`
- `saveInitiative()` → localStorage `'dm-initiative'`; cleared on campaign switch
- `nextInitiativeTurn()` logs `combat/turn` event via `dmLog()`
- `dmLog(type, subtype, summary, details)` — POST to `/api/event-log`; used for client-side events (initiative, turn advances, dice)

## Session Event Log
- Stored in `EVENT_LOG_FILE` per campaign; max 2000 entries
- **Auto-logged (server):** scene-change, player login/logout, encounter-deploy, feature-trigger, HP damage/heal/KO, all player dice rolls (including nat 20/1), DM dice rolls, campaign-switch
- **Auto-logged (client via dmLog):** initiative rolls, turn advances
- **Manual:** DM notes and AI prompt options via Session Log panel
- `/api/event-log` GET/POST/PATCH/DELETE; `includeEventLog: true` on `/api/ai-ask` injects full log into AI prompt
- 📖 Session Recap chip sends full log to AI for narrative summary
- 📌 Log button in AI response area saves prompt+options

## Map Management
- `maps-meta.json` in `BASE_DATA_DIR` (global) — `{ sceneId: { tags[], note } }`
- Tag filter chips above map search in DM sidebar
- Recent maps tracked per campaign in localStorage: key `dm-recent-<campaignName>`
- Drag-and-drop image upload on DM panel: `POST /api/maps/upload` with `{ filename, data: base64 }`

## Character Quick Setup Panel (right sidebar)
- `renderCharList()` — renders checkboxes from `dmCharacterSheets`; gold = already in roster
- `charActRoster(sheets)` — adds to `playerRoster`, saves via `POST /api/players`
- `charActMap(sheets)` — places player tokens in cluster at map center
- `charActInit(sheets)` — adds to initiative with random d20
- Right-click → context menu; action bar on selection

## Map Builder (map-builder/builder.js)
- `cellSize = 40`, textures at 64px
- `TILE_GROUPS` organized by theme; Feature tool for adding features
- Strict mode: no `function` declarations in `case` blocks

## DM Panel Layout
- **3-column layout:** Left sidebar (Maps/Audio) | Center panel-grid (60%) | Right sidebar (Character Quick Setup, Dice, Initiative)
- **Panel grid:** 4-column CSS grid; `col-1` through `col-4` span classes
- Width controls `◀ N ▶` on each panel header to cycle col span; saved in localStorage `dm-panel-widths`
- Drag ⠿ handle to reorder; saved in localStorage `dm-panel-order`
- **↺ Layout** button in header clears both localStorage keys and reloads

## Audio
- `setNowPlaying(url)` — updates `🎵 trackname ⏹` indicator in Map Control toolbar
- Called on `showSceneView`, `broadcastAudio`, stop button clicks
- Auto-stops when switching scene views

## Security Notes
- `/server.js`, `/seeds/*`, `/package.json` → 403
- `escHtml()` used for all user-visible strings
- All DM WS actions gated by `isDm` server-side
- Player input sanitized: name ≤64 chars, cls ≤32 chars, x/y clamped 0–1

## Current Version: v3.9.5

### Prep Tools (standalone pages)
| Tool | URL | Purpose |
|------|-----|---------|
| Map Builder | `/map-builder` | Tile-based map editor with fog, features, tokens |
| Scene Builder | `/scene-builder` | Create/edit scenes; assign to campaigns; preview maps |
| Characters | `/characters` | Full character sheet manager with Player View + print |

### Key REST Endpoints
| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/scenes` | Scene definitions (seeds/scenes.json) |
| GET | `/api/maps` | List map image files |
| POST | `/api/maps/upload` | Upload map image (base64 body) |
| GET/POST | `/api/maps-meta` | Global scene tags + DM notes |
| GET | `/api/campaigns` | List campaigns + active |
| POST | `/api/campaigns` | Create campaign |
| POST | `/api/campaigns/switch` | Switch active campaign (returns full state) |
| DELETE | `/api/campaigns/:name` | Delete campaign + data |
| GET | `/api/event-log` | Session events (query: type, q, limit) |
| POST | `/api/event-log` | Add manual event |
| PATCH | `/api/event-log/:id` | Update entry (note, usedOption) |
| DELETE | `/api/event-log` | Clear log |
| GET | `/api/characters` | All character sheets (global) |
| POST | `/api/characters` | Upsert character sheet |
| GET | `/api/character/:name` | Public — single sheet by name (for player view) |
| GET/POST | `/api/players` | Campaign roster (per-campaign players.json) |
| POST | `/api/dice-roll` | DM dice roll (logs + optional broadcast) |
| POST | `/api/ai-ask` | Send prompt to AI; `includeEventLog: true` injects log |
