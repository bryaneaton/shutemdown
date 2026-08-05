import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerConfig } from "./config.js";
import { normalizeMacAddress, parseMacAddressText } from "./mac.js";
import { readDevices, writeDevices } from "./storage.js";
import {
  applyDeviceList,
  getApplyStatus,
  normalizeDeviceStatus,
  readDeviceStatuses,
} from "./unifiService.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
let lastDeviceStatusRefresh = null;

app.use(express.json({ limit: "128kb" }));

function toDevice(input) {
  return {
    macAddress: normalizeMacAddress(input.macAddress),
    groupName: normalizeGroupName(input.groupName),
    name: typeof input.name === "string" ? input.name.trim() : "",
    notes: typeof input.notes === "string" ? input.notes.trim() : "",
    status: normalizeDeviceStatus(input.status),
    statusUpdatedAt: input.statusUpdatedAt || new Date().toISOString(),
    addedAt: input.addedAt || new Date().toISOString(),
  };
}

function normalizeGroupName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function groupKey(value) {
  return normalizeGroupName(value).toLowerCase();
}

function devicesFromRequest(body) {
  if (Array.isArray(body.devices)) {
    return body.devices.map((device) => ({
      ...device,
      groupName: device.groupName ?? body.groupName,
    }));
  }

  if (typeof body.macAddresses === "string") {
    return parseMacAddressText(body.macAddresses).map((macAddress) => ({
      macAddress,
      groupName: body.groupName,
      name: body.name,
      notes: body.notes,
    }));
  }

  if (body.macAddress) {
    return [body];
  }

  return [];
}

function selectDevicesForApply(devices, groupName) {
  const normalizedGroupName = normalizeGroupName(groupName);
  if (!normalizedGroupName) {
    return { devices, groupName: "" };
  }

  const selectedDevices = devices.filter(
    (device) => groupKey(device.groupName) === groupKey(normalizedGroupName),
  );
  if (selectedDevices.length === 0) {
    const error = new Error(
      `No devices found for group: ${normalizedGroupName}`,
    );
    error.status = 404;
    throw error;
  }

  return { devices: selectedDevices, groupName: normalizedGroupName };
}

function recordDeviceStatusRefreshError(error) {
  lastDeviceStatusRefresh = {
    ok: false,
    checkedAt: new Date().toISOString(),
    error: error.message,
  };
  return lastDeviceStatusRefresh;
}

async function refreshStoredDeviceStatuses(serverConfig, targetDevices = null) {
  const devices = await readDevices();
  const selectedDevices = targetDevices || devices;
  if (selectedDevices.length === 0) {
    return { ok: true, deviceCount: 0, results: [] };
  }

  const statusResult = await readDeviceStatuses(selectedDevices, serverConfig);
  const statusByMac = new Map(
    statusResult.results.map((result) => [result.macAddress, result]),
  );
  const checkedAt = statusResult.checkedAt || new Date().toISOString();
  let changed = false;

  const nextDevices = devices.map((device) => {
    const status = statusByMac.get(device.macAddress)?.status;
    if (!status || device.status === status) {
      if (device.status && device.statusUpdatedAt) {
        return device;
      }

      changed = true;
      return {
        ...device,
        status: normalizeDeviceStatus(device.status),
        statusUpdatedAt: device.statusUpdatedAt || checkedAt,
      };
    }

    changed = true;
    return { ...device, status, statusUpdatedAt: checkedAt };
  });

  if (changed) {
    await writeDevices(nextDevices);
  }

  lastDeviceStatusRefresh = {
    ...statusResult,
    deviceCount: selectedDevices.length,
  };

  return {
    ...lastDeviceStatusRefresh,
    devices: nextDevices,
  };
}

async function recordAppliedDeviceStatuses(action, applyResult) {
  const status = action === "block" ? "blocked" : "allowed";
  const appliedAt = applyResult.appliedAt || new Date().toISOString();
  const successfulMacs = new Set(
    (applyResult.results || [])
      .filter((result) => result.ok)
      .map((result) => result.macAddress),
  );

  if (successfulMacs.size === 0) {
    return [];
  }

  let changed = false;
  const nextDevices = (await readDevices()).map((device) => {
    if (!successfulMacs.has(device.macAddress)) {
      return device;
    }

    changed = true;
    return { ...device, status, statusUpdatedAt: appliedAt };
  });

  if (changed) {
    await writeDevices(nextDevices);
  }

  return nextDevices;
}

app.get("/api/devices", async (_req, res, next) => {
  try {
    res.json({ devices: await readDevices() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/devices", async (req, res, next) => {
  try {
    const inputs = devicesFromRequest(req.body);
    if (inputs.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide macAddress, macAddresses, or devices" });
    }

    const existing = await readDevices();
    const byMac = new Map(
      existing.map((device) => [device.macAddress, device]),
    );
    const added = [];
    const updated = [];
    const rejected = [];

    for (const input of inputs) {
      try {
        const device = toDevice(input);
        if (byMac.has(device.macAddress)) {
          const existingDevice = byMac.get(device.macAddress);
          const nextDevice = {
            ...existingDevice,
            ...device,
            addedAt: existingDevice.addedAt || device.addedAt,
            status: existingDevice.status || device.status,
            statusUpdatedAt:
              existingDevice.statusUpdatedAt || device.statusUpdatedAt,
            updatedAt: new Date().toISOString(),
          };
          byMac.set(device.macAddress, nextDevice);
          updated.push(nextDevice);
          continue;
        }
        byMac.set(device.macAddress, device);
        added.push(device);
      } catch (error) {
        rejected.push({
          macAddress: input?.macAddress || "",
          reason: error.message,
        });
      }
    }

    if (added.length > 0 || updated.length > 0) {
      await writeDevices([...byMac.values()]);
    }

    res.status(added.length > 0 ? 201 : 200).json({
      devices: [...byMac.values()],
      added,
      updated,
      rejected,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/devices/:macAddress", async (req, res, next) => {
  try {
    const macAddress = normalizeMacAddress(req.params.macAddress);
    const devices = await readDevices();
    const nextDevices = devices.filter(
      (device) => device.macAddress !== macAddress,
    );

    if (nextDevices.length === devices.length) {
      return res.status(404).json({ error: "Device not found" });
    }

    await writeDevices(nextDevices);
    res.json({ devices: nextDevices, removed: macAddress });
  } catch (error) {
    next(error);
  }
});

app.post("/api/apply", async (req, res, next) => {
  try {
    const selection = selectDevicesForApply(
      await readDevices(),
      req.body?.groupName,
    );
    const result = await applyDeviceList(
      selection.devices,
      await loadServerConfig(),
      "block",
      {
        groupName: selection.groupName,
      },
    );
    result.statusRefresh = await refreshStoredDeviceStatuses(
      await loadServerConfig(),
      selection.devices,
    ).catch(recordDeviceStatusRefreshError);
    await recordAppliedDeviceStatuses("block", result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/apply/:action", async (req, res, next) => {
  try {
    const action = String(req.params.action || "").toLowerCase();
    if (!["block", "allow"].includes(action)) {
      return res.status(400).json({ error: "Action must be block or allow" });
    }

    const selection = selectDevicesForApply(
      await readDevices(),
      req.body?.groupName,
    );
    const serverConfig = await loadServerConfig();
    const result = await applyDeviceList(
      selection.devices,
      serverConfig,
      action,
      {
        groupName: selection.groupName,
      },
    );
    result.statusRefresh = await refreshStoredDeviceStatuses(
      serverConfig,
      selection.devices,
    ).catch(recordDeviceStatusRefreshError);
    await recordAppliedDeviceStatuses(action, result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/status", async (_req, res) => {
  const serverConfig = await loadServerConfig();
  res.json({
    configLoaded: serverConfig.loaded,
    configError: serverConfig.error || null,
    unifiEnabled: Boolean(serverConfig.config?.unifi?.enabled),
    unifiMode: serverConfig.config?.unifi?.enabled ? "api-key" : "stub",
    unifiConfigured: Boolean(
      serverConfig.config?.unifi?.apiKey &&
      serverConfig.config?.unifi?.consoleId &&
      serverConfig.config?.unifi?.site,
    ),
    lastApply: getApplyStatus(),
    lastDeviceStatusRefresh,
  });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(rootDir, "dist/index.html"));
  });
}

app.use((error, _req, res, _next) => {
  const status =
    error.status ||
    (error.message?.startsWith("Invalid MAC address") ? 400 : 500);
  res.status(status).json({ error: error.message || "Server error" });
});

const config = await loadServerConfig();
refreshStoredDeviceStatuses(config).catch((error) => {
  recordDeviceStatusRefreshError(error);
  console.error(`Device status refresh failed: ${error.message}`);
});
const port = Number(process.env.PORT || config.config?.server?.port || 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
