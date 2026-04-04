// src/types/layout.ts

export type SceneType = "map" | "video" | "audio" | "text";

export interface SceneOptions {
  loop?: boolean;
  transition?: "none" | "fade" | "slide" | "zoom";
  fit?: "contain" | "cover";
}

export interface Scene {
  id: string;
  label: string;
  type: SceneType;
  mediaPath?: string;
  textContent?: string;
  notes?: string;
  quickPrep?: boolean;
  options?: SceneOptions;
}

export interface LayoutButton {
  id: string;
  sceneId: string;
  row: number;
  col: number;
}

export interface LayoutConfig {
  id: string;
  name: string;
  scenes: Scene[];
  buttons: LayoutButton[];
}

export interface AppData {
  layouts: LayoutConfig[];
  activeLayoutId: string | null;
}

export interface AudioBusState {
  ambienceId: string | null;
  musicId: string | null;
  sfxId: string | null;
}