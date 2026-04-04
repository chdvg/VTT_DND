import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

function getLogDir() {
  const dir = path.join(app.getPath("userData"), "session-logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  return dir;
}

function getTodayFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(getLogDir(), `${date}.jsonl`);
}

export function logEvent(event: any) {
  const entry = {
    timestamp: Date.now(),
    ...event
  };
  fs.appendFileSync(getTodayFile(), JSON.stringify(entry) + "\n", "utf-8");
}

logEvent.readToday = () => {
  const file = getTodayFile();
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
  return lines.map(l => JSON.parse(l));
};