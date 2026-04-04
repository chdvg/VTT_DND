import { app, BrowserWindow, ipcMain, screen, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import { startRemoteServer, broadcastPlayerCommand, fogState, initiativeList, currentTurn, partyItems, setInitiativeList, setCurrentTurn, setPartyItems, InitEntry, PartyItem } from "./remoteServer";
import { startRendererServer, RENDERER_DM_URL, RENDERER_PLAYER_URL } from "./rendererServer";
import { loadAppData, saveAppData, seedDefaultData, watchSeeds } from "./storage";
import { logEvent } from "./logger";



let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createDMWindow() {
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    dmWindow.loadURL("http://localhost:5173/src/dm/index.html");
    dmWindow.webContents.openDevTools();
  } else {
    dmWindow.loadURL(RENDERER_DM_URL);
  }

  dmWindow.on("closed", () => (dmWindow = null));
}

function createPlayerWindow() {
  const displays = screen.getAllDisplays();
  const external = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
  const target = external ?? displays[0];

  playerWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    frame: false,
    fullscreen: true,
    backgroundColor: "#000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    playerWindow.loadURL("http://localhost:5173/src/player/index.html");
  } else {
    playerWindow.loadURL(RENDERER_PLAYER_URL);
  }

  playerWindow.on("closed", () => (playerWindow = null));
}

function setupIPC() {
  // Session-only fog state: sceneId → revealed grid (row x col boolean)
  function initFogGrid(cols: number, rows: number): boolean[][] {
    return Array.from({ length: rows }, () => Array(cols).fill(false));
  }

  ipcMain.on("dm-command", (_event, msg) => {
    logEvent(msg);

    // When showing a fog-enabled map, initialise its fog grid (if not already)
    if (msg.type === "SHOW_SCENE" && msg.sceneId) {
      const appData = loadAppData();
      const layout = appData.layouts.find(l => l.id === appData.activeLayoutId);
      const scene = layout?.scenes.find(s => s.id === msg.sceneId);
      if (scene?.fogEnabled) {
        const cols = scene.fogCols ?? 10;
        const rows = scene.fogRows ?? 8;
        if (!fogState.has(scene.id)) {
          fogState.set(scene.id, initFogGrid(cols, rows));
        }
        // Send SHOW_SCENE first so the player switches scene, THEN apply fog
        if (playerWindow) playerWindow.webContents.send("player-command", msg);
        broadcastPlayerCommand(msg);
        const fogMsg = { type: "UPDATE_FOG", sceneId: scene.id, fogGrid: fogState.get(scene.id) };
        if (playerWindow) playerWindow.webContents.send("player-command", fogMsg);
        broadcastPlayerCommand(fogMsg);
        return;
      }
    }

    if (playerWindow) {
      playerWindow.webContents.send("player-command", msg);
    }
    broadcastPlayerCommand(msg);
  });

  ipcMain.handle("get-app-data", () => loadAppData());
  ipcMain.handle("save-app-data", (_e, data) => {
    saveAppData(data);
    broadcastPlayerCommand({ type: "DATA_UPDATED" });
  });

  ipcMain.handle("get-session-log", () => {
    return logEvent.readToday();
  });

  ipcMain.handle("copy-asset", (_e, srcPath: string) => {
    const ext = path.extname(srcPath).toLowerCase();
    const audioExts = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];
    const videoExts = [".mp4", ".webm", ".mov", ".mkv"];
    const subdir = audioExts.includes(ext) ? "audio" : videoExts.includes(ext) ? "video" : "maps";
    // In dev, write to public/assets/ so Vite serves it at /assets/
    // In production, write to userData/assets/ where rendererServer picks it up
    const destDir = isDev
      ? path.join(__dirname, "../../public/assets", subdir)
      : path.join(app.getPath("userData"), "assets", subdir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const filename = path.basename(srcPath);
    fs.copyFileSync(srcPath, path.join(destDir, filename));
    return `/assets/${subdir}/${filename}`;
  });

  ipcMain.on("remote-command", (_e, msg) => {
    if (!dmWindow) return;
    dmWindow.webContents.send("remote-command", msg);
  });

  ipcMain.handle("get-fog", (_e, sceneId: string) => {
    return fogState.get(sceneId) ?? null;
  });

  ipcMain.handle("toggle-fog-cell", (_e, sceneId: string, row: number, col: number, revealed: boolean) => {
    const grid = fogState.get(sceneId);
    if (!grid || row >= grid.length || col >= grid[0].length) return;
    grid[row][col] = revealed;
    const fogMsg = { type: "UPDATE_FOG", sceneId, fogGrid: grid };
    if (playerWindow) playerWindow.webContents.send("player-command", fogMsg);
    broadcastPlayerCommand(fogMsg);
  });

  ipcMain.handle("set-fog-all", (_e, sceneId: string, revealed: boolean) => {
    const grid = fogState.get(sceneId);
    if (!grid) return;
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        grid[r][c] = revealed;
    const fogMsg = { type: "UPDATE_FOG", sceneId, fogGrid: grid };
    if (playerWindow) playerWindow.webContents.send("player-command", fogMsg);
    broadcastPlayerCommand(fogMsg);
  });

  // ── Initiative IPC ─────────────────────────────────────
  ipcMain.handle("get-initiative", () => ({ list: initiativeList, currentTurn }));

  ipcMain.handle("add-initiative", (_e, entry: InitEntry) => {
    const list = [...initiativeList, entry].sort((a, b) => b.roll - a.roll);
    setInitiativeList(list);
    broadcastInitiativeFromMain();
  });

  ipcMain.handle("remove-initiative", (_e, index: number) => {
    const list = [...initiativeList];
    list.splice(index, 1);
    setInitiativeList(list);
    let turn = currentTurn;
    if (turn >= list.length) turn = 0;
    setCurrentTurn(turn);
    broadcastInitiativeFromMain();
  });

  ipcMain.handle("next-initiative", () => {
    if (initiativeList.length === 0) return;
    setCurrentTurn((currentTurn + 1) % initiativeList.length);
    broadcastInitiativeFromMain();
  });

  ipcMain.handle("clear-initiative", () => {
    setInitiativeList([]);
    setCurrentTurn(0);
    broadcastInitiativeFromMain();
  });

  ipcMain.handle("update-initiative-hp", (_e, index: number, hp: number) => {
    if (index < 0 || index >= initiativeList.length) return;
    initiativeList[index].hp = hp;
    broadcastInitiativeFromMain();
  });

  function broadcastInitiativeFromMain() {
    const msg = { type: "UPDATE_INITIATIVE", list: initiativeList, currentTurn };
    if (playerWindow) playerWindow.webContents.send("player-command", msg);
    broadcastPlayerCommand(msg);
    if (dmWindow) dmWindow.webContents.send("initiative-updated", { list: initiativeList, currentTurn });
  }

  // ── Party Items IPC ────────────────────────────────────
  ipcMain.handle("get-items", () => partyItems);

  ipcMain.handle("add-item", (_e, item: Omit<PartyItem, "id">) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newItem: PartyItem = { id, name: item.name, qty: item.qty || 1, notes: item.notes };
    partyItems.push(newItem);
    setPartyItems([...partyItems]);
    broadcastItemsFromMain();
  });

  ipcMain.handle("remove-item", (_e, id: string) => {
    setPartyItems(partyItems.filter(i => i.id !== id));
    broadcastItemsFromMain();
  });

  ipcMain.handle("update-item", (_e, id: string, updates: Partial<PartyItem>) => {
    const item = partyItems.find(i => i.id === id);
    if (!item) return;
    if (updates.qty != null) item.qty = updates.qty;
    if (updates.notes != null) item.notes = updates.notes;
    if (updates.name != null) item.name = updates.name;
    broadcastItemsFromMain();
  });

  function broadcastItemsFromMain() {
    const msg = { type: "UPDATE_ITEMS", items: partyItems };
    if (playerWindow) playerWindow.webContents.send("player-command", msg);
    broadcastPlayerCommand(msg);
    if (dmWindow) dmWindow.webContents.send("items-updated", partyItems);
  }
}

app.whenReady().then(async () => {
  console.log("[Electron] App ready — launching windows");

  if (!isDev) {
    await startRendererServer();
  }

  // Only enforce CSP in production. In dev, Vite injects inline scripts
  // that would be blocked by a strict policy — the Electron warning is
  // informational only and disappears once packaged.
  if (!isDev) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:"
    ].join("; ");

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [csp]
        }
      });
    });
  }
  seedDefaultData();
  createDMWindow();
  createPlayerWindow();
  setupIPC();

  watchSeeds((updatedLayout) => {
    // Upsert the layout into saved app data
    const appData = loadAppData();
    const idx = appData.layouts.findIndex(l => l.id === updatedLayout.id);
    if (idx >= 0) {
      appData.layouts[idx] = updatedLayout;
    } else {
      appData.layouts.push(updatedLayout);
      if (!appData.activeLayoutId) appData.activeLayoutId = updatedLayout.id;
    }
    saveAppData(appData);

    // Notify all open windows to re-fetch app data
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send("data-updated");
    });
    broadcastPlayerCommand({ type: "DATA_UPDATED" });
  });

  if (dmWindow) startRemoteServer(dmWindow, () => playerWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDMWindow();
      createPlayerWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});