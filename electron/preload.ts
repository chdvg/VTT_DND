import { contextBridge, ipcRenderer, webUtils } from "electron";
import { AppData } from "../shared/types/layout";

contextBridge.exposeInMainWorld("electronAPI", {
  sendDMCommand: (msg: any) => ipcRenderer.send("dm-command", msg),

  onPlayerCommand: (callback: (msg: any) => void) =>
    ipcRenderer.on("player-command", (_e, msg) => callback(msg)),

  onRemoteCommand: (callback: (msg: any) => void) =>
    ipcRenderer.on("remote-command", (_e, msg) => callback(msg)),

  getAppData: (): Promise<AppData> => ipcRenderer.invoke("get-app-data"),
  saveAppData: (data: AppData) => ipcRenderer.invoke("save-app-data", data),

  getSessionLog: () => ipcRenderer.invoke("get-session-log"),

  onDataUpdated: (callback: () => void) =>
    ipcRenderer.on("data-updated", () => callback()),

  getFilePath: (file: File) => webUtils.getPathForFile(file),
  copyAsset: (srcPath: string): Promise<string> => ipcRenderer.invoke("copy-asset", srcPath),

  getFog: (sceneId: string): Promise<boolean[][] | null> => ipcRenderer.invoke("get-fog", sceneId),
  toggleFogCell: (sceneId: string, row: number, col: number, revealed: boolean): Promise<void> =>
    ipcRenderer.invoke("toggle-fog-cell", sceneId, row, col, revealed),
  setFogAll: (sceneId: string, revealed: boolean): Promise<void> =>
    ipcRenderer.invoke("set-fog-all", sceneId, revealed),
});