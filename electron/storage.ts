import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { AppData, LayoutConfig } from "../shared/types/layout";

const fileName = "dnd-control.json";

function getDataPath() {
  return path.join(app.getPath("userData"), fileName);
}

export function loadAppData(): AppData {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) {
    return { layouts: [], activeLayoutId: null };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export function saveAppData(data: AppData) {
  const filePath = getDataPath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getSeedsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "seeds");
  }
  // __dirname is dist/electron/ at runtime — go up two levels to project root
  return path.join(__dirname, "../../seeds");
}

function loadSeedLayouts(): LayoutConfig[] {
  const seedsDir = getSeedsDir();
  if (!fs.existsSync(seedsDir)) return [];

  return fs.readdirSync(seedsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const raw = fs.readFileSync(path.join(seedsDir, f), "utf-8");
      return JSON.parse(raw) as LayoutConfig;
    });
}

export function watchSeeds(onChange: (layout: LayoutConfig) => void): () => void {
  const seedsDir = getSeedsDir();
  if (!fs.existsSync(seedsDir)) return () => {};

  // Debounce per-file so rapid saves don't fire twice
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  const watcher = fs.watch(seedsDir, (_event, filename) => {
    if (!filename || !filename.endsWith(".json")) return;

    clearTimeout(timers[filename]);
    timers[filename] = setTimeout(() => {
      const filePath = path.join(seedsDir, filename);
      if (!fs.existsSync(filePath)) return;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const layout = JSON.parse(raw) as LayoutConfig;
        onChange(layout);
      } catch {
        // Ignore parse errors while the file is mid-save
      }
    }, 150);
  });

  return () => watcher.close();
}

export function seedDefaultData() {
  const filePath = getDataPath();
  if (fs.existsSync(filePath)) return;

  const layouts = loadSeedLayouts();
  const initial: AppData = {
    layouts,
    activeLayoutId: layouts[0]?.id ?? null
  };

  fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf-8");
}
