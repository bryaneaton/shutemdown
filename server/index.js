import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerConfig } from './config.js';
import { normalizeMacAddress, parseMacAddressText } from './mac.js';
import { readDevices, writeDevices } from './storage.js';
import { applyDeviceList, getApplyStatus } from './unifiService.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

app.use(express.json({ limit: '128kb' }));

function toDevice(input) {
  return {
    macAddress: normalizeMacAddress(input.macAddress),
    name: typeof input.name === 'string' ? input.name.trim() : '',
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
    addedAt: input.addedAt || new Date().toISOString()
  };
}

function devicesFromRequest(body) {
  if (Array.isArray(body.devices)) {
    return body.devices;
  }

  if (typeof body.macAddresses === 'string') {
    return parseMacAddressText(body.macAddresses).map((macAddress) => ({
      macAddress,
      name: body.name,
      notes: body.notes
    }));
  }

  if (body.macAddress) {
    return [body];
  }

  return [];
}

app.get('/api/devices', async (_req, res, next) => {
  try {
    res.json({ devices: await readDevices() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/devices', async (req, res, next) => {
  try {
    const inputs = devicesFromRequest(req.body);
    if (inputs.length === 0) {
      return res.status(400).json({ error: 'Provide macAddress, macAddresses, or devices' });
    }

    const existing = await readDevices();
    const byMac = new Map(existing.map((device) => [device.macAddress, device]));
    const added = [];
    const updated = [];
    const rejected = [];

    for (const input of inputs) {
      try {
        const device = toDevice(input);
        if (byMac.has(device.macAddress)) {
          const existingDevice = byMac.get(device.macAddress);
          const nextDevice = {
            ...device,
            addedAt: existingDevice.addedAt || device.addedAt,
            updatedAt: new Date().toISOString()
          };
          byMac.set(device.macAddress, nextDevice);
          updated.push(nextDevice);
          continue;
        }
        byMac.set(device.macAddress, device);
        added.push(device);
      } catch (error) {
        rejected.push({ macAddress: input?.macAddress || '', reason: error.message });
      }
    }

    if (added.length > 0 || updated.length > 0) {
      await writeDevices([...byMac.values()]);
    }

    res.status(added.length > 0 ? 201 : 200).json({
      devices: [...byMac.values()],
      added,
      updated,
      rejected
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/devices/:macAddress', async (req, res, next) => {
  try {
    const macAddress = normalizeMacAddress(req.params.macAddress);
    const devices = await readDevices();
    const nextDevices = devices.filter((device) => device.macAddress !== macAddress);

    if (nextDevices.length === devices.length) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await writeDevices(nextDevices);
    res.json({ devices: nextDevices, removed: macAddress });
  } catch (error) {
    next(error);
  }
});

app.post('/api/apply', async (_req, res, next) => {
  try {
    const result = await applyDeviceList(await readDevices(), await loadServerConfig());
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/apply/:action', async (req, res, next) => {
  try {
    const action = String(req.params.action || '').toLowerCase();
    if (!['block', 'allow'].includes(action)) {
      return res.status(400).json({ error: 'Action must be block or allow' });
    }

    const result = await applyDeviceList(await readDevices(), await loadServerConfig(), action);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/status', async (_req, res) => {
  const serverConfig = await loadServerConfig();
  res.json({
    configLoaded: serverConfig.loaded,
    configError: serverConfig.error || null,
    unifiEnabled: Boolean(serverConfig.config?.unifi?.enabled),
    unifiMode: serverConfig.config?.unifi?.enabled ? 'api-key' : 'stub',
    unifiConfigured: Boolean(
      serverConfig.config?.unifi?.apiKey &&
      serverConfig.config?.unifi?.consoleId &&
      serverConfig.config?.unifi?.site
    ),
    lastApply: getApplyStatus()
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(rootDir, 'dist/index.html'));
  });
}

app.use((error, _req, res, _next) => {
  const status = error.message?.startsWith('Invalid MAC address') ? 400 : 500;
  res.status(status).json({ error: error.message || 'Server error' });
});

const config = await loadServerConfig();
const port = Number(process.env.PORT || config.config?.server?.port || 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
