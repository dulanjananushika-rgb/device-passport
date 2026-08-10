import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDatabaseFilePath } from "./database";

export function logSystemEvent(level: "info" | "warn" | "error", event: string, message: string) {
  try {
    const databasePath = getDatabaseFilePath();
    if (databasePath === ":memory:") return;
    const directory = path.join(path.dirname(databasePath), "logs");
    mkdirSync(directory, { recursive: true });
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, message: message.slice(0, 1000) });
    appendFileSync(path.join(directory, "system.log"), `${entry}\n`, "utf8");
  } catch {
    // Logging must never prevent the primary recovery operation.
  }
}
