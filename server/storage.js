import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('config');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

async function ensureStorage() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readDevices() {
  await ensureStorage();

  try {
    const data = await readFile(DEVICES_FILE, 'utf8');
    const devices = JSON.parse(data);
    return Array.isArray(devices) ? devices : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeDevices([]);
      return [];
    }
    throw error;
  }
}

export async function writeDevices(devices) {
  await ensureStorage();
  const tmpFile = `${DEVICES_FILE}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(devices, null, 2)}\n`, 'utf8');
  await rename(tmpFile, DEVICES_FILE);
}
