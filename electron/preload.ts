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

  // Initiative
  getInitiative: (): Promise<{ list: any[]; currentTurn: number }> => ipcRenderer.invoke("get-initiative"),
  addInitiative: (entry: { name: string; roll: number; hp?: number; maxHp?: number }): Promise<void> =>
    ipcRenderer.invoke("add-initiative", entry),
  removeInitiative: (index: number): Promise<void> => ipcRenderer.invoke("remove-initiative", index),
  nextInitiative: (): Promise<void> => ipcRenderer.invoke("next-initiative"),
  clearInitiative: (): Promise<void> => ipcRenderer.invoke("clear-initiative"),
  updateInitiativeHp: (index: number, hp: number): Promise<void> => ipcRenderer.invoke("update-initiative-hp", index, hp),
  onInitiativeUpdated: (callback: (data: { list: any[]; currentTurn: number }) => void) =>
    ipcRenderer.on("initiative-updated", (_e, data) => callback(data)),

  // Party Items
  getItems: (): Promise<any[]> => ipcRenderer.invoke("get-items"),
  addItem: (item: { name: string; qty?: number; notes?: string }): Promise<void> =>
    ipcRenderer.invoke("add-item", item),
  removeItem: (id: string): Promise<void> => ipcRenderer.invoke("remove-item", id),
  updateItem: (id: string, updates: { qty?: number; notes?: string; name?: string }): Promise<void> =>
    ipcRenderer.invoke("update-item", id, updates),
  onItemsUpdated: (callback: (items: any[]) => void) =>
    ipcRenderer.on("items-updated", (_e, items) => callback(items)),
});