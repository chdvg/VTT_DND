// Serves the Vite-built renderer and user assets via HTTP in production.
// This is needed because loadFile() + file:// protocol breaks absolute
// paths like /assets/maps/foo.png used throughout the renderer.
import express from "express";
import * as path from "path";
import * as fs from "fs";
import { app as electronApp } from "electron";

const PORT = 3002;

export const RENDERER_DM_URL = `http://127.0.0.1:${PORT}/dm`;
export const RENDERER_PLAYER_URL = `http://127.0.0.1:${PORT}/player`;

export function startRendererServer(): Promise<void> {
  const server = express();

  // dist/electron/rendererServer.js → dist/renderer/
  const rendererDir = path.join(__dirname, "../renderer");

  // Bundled assets shipped with the installer (extraResources → resources/assets/)
  const bundledAssetsDir = path.join(process.resourcesPath, "assets");

  // User-added assets written by copy-asset IPC handler
  const userAssetsDir = path.join(electronApp.getPath("userData"), "assets");

  // 1. Vite-built JS/CSS bundles live in dist/renderer/assets/  (hashed names)
  server.use("/assets", express.static(path.join(rendererDir, "assets")));

  // 2. User maps/audio/video — check userData first, fall back to bundled
  server.use("/assets", (req, res, next) => {
    const relPath = req.path.replace(/^\//, ""); // e.g. "maps/phandalin.png"
    const userPath = path.join(userAssetsDir, relPath);
    const bundledPath = path.join(bundledAssetsDir, relPath);

    if (fs.existsSync(userPath)) {
      res.sendFile(userPath);
    } else if (fs.existsSync(bundledPath)) {
      res.sendFile(bundledPath);
    } else {
      next();
    }
  });

  // 3. DM and Player HTML entry points
  server.get("/dm", (_req, res) => {
    res.sendFile(path.join(rendererDir, "src/dm/index.html"));
  });
  server.get("/player", (_req, res) => {
    res.sendFile(path.join(rendererDir, "src/player/index.html"));
  });

  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });
}
