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
    };
  }
}

export {};
