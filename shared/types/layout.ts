export interface SceneOptions {
  transition?: "fade" | "slide" | "zoom" | "none";
  fit?: string;
  loop?: boolean;
  audioType?: "ambience" | "music" | "sfx";
  linkedAmbienceId?: string; // optional ambience scene to auto-play with this scene
}

export interface SceneView {
  id: string;
  label: string;
  mediaPath: string;
  fit?: string; // overrides scene options fit for this view
  linkedAmbienceId?: string | null; // undefined=inherit scene default, null=silence, string=specific ambience
}

export interface SceneClip {
  id: string;
  label: string;
  videoPath: string;
  chainToScene?: boolean; // if true, show the scene after the clip finishes
}

export interface Scene {
  id: string;
  label: string;
  type: "map" | "video" | "audio" | "text" | "utility";
  mediaPath?: string;        // optional since text scenes won't have it
  textContent?: string;      // for text scenes
  quickPrep?: boolean;       // for quick prep row in HomeScreen
  options?: SceneOptions;
  notes?: string;
  views?: SceneView[];       // alternate views/images for this scene
  clips?: SceneClip[];       // one-shot video clips that play as an overlay
  fogEnabled?: boolean;      // show black fog-of-war overlay (map type only)
  fogCols?: number;          // fog grid columns (default 10)
  fogRows?: number;          // fog grid rows (default 8)
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
  gridRows?: number;
  gridCols?: number;
}

export interface AppData {
  layouts: LayoutConfig[];
  activeLayoutId: string | null;
}