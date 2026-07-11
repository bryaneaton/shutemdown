import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'js-yaml';

const CONFIG_FILE = path.resolve('config/server.yaml');

export async function loadServerConfig() {
  try {
    const contents = await readFile(CONFIG_FILE, 'utf8');
    return {
      loaded: true,
      path: CONFIG_FILE,
      config: load(contents) ?? {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        loaded: false,
        path: CONFIG_FILE,
        config: {},
        error: 'config/server.yaml was not found'
      };
    }
    return {
      loaded: false,
      path: CONFIG_FILE,
      config: {},
      error: error.message
    };
  }
}
