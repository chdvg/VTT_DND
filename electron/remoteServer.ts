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

export { fogState };

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

  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  server.listen(3001, "0.0.0.0");
}