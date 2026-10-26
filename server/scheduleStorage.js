import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("config");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");

async function ensureStorage() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readSchedules() {
  await ensureStorage();

  try {
    const data = await readFile(SCHEDULES_FILE, "utf8");
    const schedules = JSON.parse(data);
    return Array.isArray(schedules) ? schedules : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeSchedules([]);
      return [];
    }
    throw error;
  }
}

export async function writeSchedules(schedules) {
  await ensureStorage();
  const tmpFile = `${SCHEDULES_FILE}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(schedules, null, 2)}\n`, "utf8");
  await rename(tmpFile, SCHEDULES_FILE);
}
