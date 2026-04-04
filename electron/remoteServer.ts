import express from "express";
import path from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { BrowserWindow, app as electronApp } from "electron";
import { loadAppData } from "./storage";
import { LayoutConfig } from "../shared/types/layout";

const clients = new Set<WebSocket>();

// Fog state shared with main.ts via module-level Map exposed here
const fogState = new Map<string, boolean[][]>();

// Initiative tracker state
export interface InitEntry { name: string; roll: number; hp?: number; maxHp?: number; }
let initiativeList: InitEntry[] = [];
let currentTurn = 0;

// Party items / inventory state
export interface PartyItem { id: string; name: string; qty: number; notes?: string; }
let partyItems: PartyItem[] = [];

export { fogState, initiativeList, currentTurn, partyItems };

export function setInitiativeList(list: InitEntry[]) { initiativeList = list; }
export function setCurrentTurn(turn: number) { currentTurn = turn; }
export function setPartyItems(items: PartyItem[]) { partyItems = items; }

export function broadcastPlayerCommand(msg: object) {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function startRemoteServer(
  _dmWindow: BrowserWindow,
  getPlayerWindow: () => BrowserWindow | null
) {
  const app = express();
  app.use(express.json());

  // Static files for the remote UI and web player
  const staticDir = path.join(__dirname, "../../remote");
  app.use("/remote", express.static(staticDir));

  // Serve assets so the web player can load images/videos over LAN
  const isDev = !electronApp.isPackaged;
  const userAssetsDir = isDev
    ? path.join(__dirname, "../../public/assets")
    : path.join(electronApp.getPath("userData"), "assets");
  app.use("/assets", express.static(userAssetsDir));
  if (!isDev) {
    const bundledAssetsDir = path.join(process.resourcesPath, "assets");
    app.use("/assets", express.static(bundledAssetsDir));
  }

  // Convenience redirect so the iPad just opens /player
  app.get("/player", (_req, res) => {
    res.redirect("/remote/player.html");
  });

  // Root redirect to remote control UI
  app.get("/", (_req, res) => {
    res.redirect("/remote/index.html");
  });

  app.get("/api/layout", (_req, res) => {
    const data = loadAppData();
    const layout = data.layouts.find((l: LayoutConfig) => l.id === data.activeLayoutId);
    res.json(layout ?? null);
  });

  function sendToPlayer(msg: object) {
    const pw = getPlayerWindow();
    if (pw) pw.webContents.send("player-command", msg);
    broadcastPlayerCommand(msg);
  }

  app.post("/api/show-scene", (req, res) => {
    const msg: Record<string, unknown> = { type: "SHOW_SCENE", sceneId: req.body.sceneId };
    if (req.body.mediaPath) msg.mediaPath = req.body.mediaPath;
    if (req.body.fit) msg.fit = req.body.fit;
    sendToPlayer(msg);
    // If the scene has fog enabled, init its grid and send UPDATE_FOG right after
    const data = loadAppData();
    const layout = data.layouts.find((l: LayoutConfig) => l.id === data.activeLayoutId);
    const scene = layout?.scenes.find((s: { id: string }) => s.id === req.body.sceneId) as any;
    if (scene?.fogEnabled) {
      const cols = scene.fogCols ?? 10;
      const rows = scene.fogRows ?? 8;
      if (!fogState.has(scene.id)) {
        fogState.set(scene.id, Array.from({ length: rows }, () => Array(cols).fill(false)));
      }
      sendToPlayer({ type: "UPDATE_FOG", sceneId: scene.id, fogGrid: fogState.get(scene.id) });
    }
    res.sendStatus(200);
  });

  app.post("/api/blackout", (_req, res) => {
    sendToPlayer({ type: "BLACKOUT" });
    res.sendStatus(200);
  });

  app.post("/api/play-audio", (req, res) => {
    const typeMap: Record<string, string> = {
      ambience: "PLAY_AMBIENCE",
      music: "PLAY_MUSIC",
      sfx: "PLAY_SFX"
    };
    const msgType = typeMap[req.body.audioType];
    if (!msgType) { res.sendStatus(400); return; }
    sendToPlayer({ type: msgType, sceneId: req.body.sceneId });
    res.sendStatus(200);
  });

  app.post("/api/stop-audio", (req, res) => {
    const typeMap: Record<string, string> = {
      ambience: "STOP_AMBIENCE",
      music: "STOP_MUSIC",
      sfx: "STOP_SFX"
    };
    const msgType = typeMap[req.body.audioType];
    if (!msgType) { res.sendStatus(400); return; }
    sendToPlayer({ type: msgType });
    res.sendStatus(200);
  });

  app.get("/api/fog/:sceneId", (req, res) => {
    res.json(fogState.get(req.params.sceneId) ?? null);
  });

  app.post("/api/fog/toggle-cell", (req, res) => {
    const { sceneId, row, col, revealed } = req.body;
    const grid = fogState.get(sceneId);
    if (!grid || row >= grid.length || col >= grid[0].length) { res.sendStatus(400); return; }
    grid[row][col] = revealed;
    const fogMsg = { type: "UPDATE_FOG", sceneId, fogGrid: grid };
    sendToPlayer(fogMsg);
    res.sendStatus(200);
  });

  app.post("/api/fog/set-all", (req, res) => {
    const { sceneId, revealed } = req.body;
    const grid = fogState.get(sceneId);
    if (!grid) { res.sendStatus(400); return; }
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        grid[r][c] = revealed;
    const fogMsg = { type: "UPDATE_FOG", sceneId, fogGrid: grid };
    sendToPlayer(fogMsg);
    res.sendStatus(200);
  });

  // ── Initiative API ──────────────────────────────────────
  app.get("/api/initiative", (_req, res) => {
    res.json({ list: initiativeList, currentTurn });
  });

  app.post("/api/initiative/add", (req, res) => {
    const { name, roll, hp, maxHp } = req.body;
    if (!name || roll == null) { res.sendStatus(400); return; }
    initiativeList.push({ name, roll: Number(roll), hp: hp != null ? Number(hp) : undefined, maxHp: maxHp != null ? Number(maxHp) : undefined });
    initiativeList.sort((a, b) => b.roll - a.roll);
    broadcastInitiative();
    res.sendStatus(200);
  });

  app.post("/api/initiative/remove", (req, res) => {
    const { index } = req.body;
    if (index == null || index < 0 || index >= initiativeList.length) { res.sendStatus(400); return; }
    initiativeList.splice(index, 1);
    if (currentTurn >= initiativeList.length) currentTurn = 0;
    broadcastInitiative();
    res.sendStatus(200);
  });

  app.post("/api/initiative/next", (_req, res) => {
    if (initiativeList.length === 0) { res.sendStatus(200); return; }
    currentTurn = (currentTurn + 1) % initiativeList.length;
    broadcastInitiative();
    res.sendStatus(200);
  });

  app.post("/api/initiative/clear", (_req, res) => {
    initiativeList = [];
    currentTurn = 0;
    broadcastInitiative();
    res.sendStatus(200);
  });

  app.post("/api/initiative/update-hp", (req, res) => {
    const { index, hp } = req.body;
    if (index == null || index < 0 || index >= initiativeList.length) { res.sendStatus(400); return; }
    initiativeList[index].hp = Number(hp);
    broadcastInitiative();
    res.sendStatus(200);
  });

  function broadcastInitiative() {
    const msg = { type: "UPDATE_INITIATIVE", list: initiativeList, currentTurn };
    broadcastPlayerCommand(msg);
    // Also notify DM window
    const pw = getPlayerWindow();
    if (pw) pw.webContents.send("player-command", msg);
  }

  // ── Party Items API ────────────────────────────────────────
  app.get("/api/items", (_req, res) => {
    res.json(partyItems);
  });

  app.post("/api/items/add", (req, res) => {
    const { name, qty, notes } = req.body;
    if (!name) { res.sendStatus(400); return; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    partyItems.push({ id, name, qty: Number(qty) || 1, notes: notes || undefined });
    broadcastItems();
    res.sendStatus(200);
  });

  app.post("/api/items/remove", (req, res) => {
    const { id } = req.body;
    partyItems = partyItems.filter(i => i.id !== id);
    broadcastItems();
    res.sendStatus(200);
  });

  app.post("/api/items/update", (req, res) => {
    const { id, qty, notes } = req.body;
    const item = partyItems.find(i => i.id === id);
    if (!item) { res.sendStatus(400); return; }
    if (qty != null) item.qty = Number(qty);
    if (notes != null) item.notes = notes;
    broadcastItems();
    res.sendStatus(200);
  });

  function broadcastItems() {
    const msg = { type: "UPDATE_ITEMS", items: partyItems };
    broadcastPlayerCommand(msg);
  }

  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  server.listen(3001, "0.0.0.0");
}