import type { AppData } from "../../shared/types/layout";

declare global {
  interface Window {
    electronAPI: {
      sendDMCommand: (msg: { type: string; sceneId?: string; mediaPath?: string; fit?: string; videoPath?: string; chainSceneId?: string; chainMediaPath?: string; chainFit?: string }) => void;
      onPlayerCommand: (callback: (msg: any) => void) => void;
      onRemoteCommand: (callback: (msg: any) => void) => void;
      getAppData: () => Promise<AppData>;
      saveAppData: (data: AppData) => void;
      getSessionLog: () => Promise<any[]>;
      onDataUpdated: (callback: () => void) => void;
      getFilePath: (file: File) => string;
      copyAsset: (srcPath: string) => Promise<string>;
      getFog: (sceneId: string) => Promise<boolean[][] | null>;
      toggleFogCell: (sceneId: string, row: number, col: number, revealed: boolean) => Promise<void>;
      setFogAll: (sceneId: string, revealed: boolean) => Promise<void>;

      // Initiative
      getInitiative: () => Promise<{ list: { name: string; roll: number; hp?: number; maxHp?: number }[]; currentTurn: number }>;
      addInitiative: (entry: { name: string; roll: number; hp?: number; maxHp?: number }) => Promise<void>;
      removeInitiative: (index: number) => Promise<void>;
      nextInitiative: () => Promise<void>;
      clearInitiative: () => Promise<void>;
      updateInitiativeHp: (index: number, hp: number) => Promise<void>;
      onInitiativeUpdated: (callback: (data: { list: any[]; currentTurn: number }) => void) => void;

      // Party Items
      getItems: () => Promise<{ id: string; name: string; qty: number; notes?: string }[]>;
      addItem: (item: { name: string; qty?: number; notes?: string }) => Promise<void>;
      removeItem: (id: string) => Promise<void>;
      updateItem: (id: string, updates: { qty?: number; notes?: string; name?: string }) => Promise<void>;
      onItemsUpdated: (callback: (items: any[]) => void) => void;
    };
  }
}

export {};
