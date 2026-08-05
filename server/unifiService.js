let lastApply = null;

const DEVICE_STATUS_ALLOWED = "allowed";
const DEVICE_STATUS_BLOCKED = "blocked";

export async function applyDeviceList(
  devices,
  serverConfig,
  action = "block",
  target = {},
) {
  const unifi = serverConfig.config?.unifi ?? {};

  if (!serverConfig.loaded) {
    throw new Error(serverConfig.error || "Server configuration is not loaded");
  }

  if (!unifi.enabled) {
    lastApply = {
      ok: true,
      appliedAt: new Date().toISOString(),
      deviceCount: devices.length,
      mode: "stub",
      action,
      groupName: target.groupName || null,
      results: devices.map((device) => ({
        macAddress: device.macAddress,
        ok: true,
        mode: "stub",
      })),
    };
    return lastApply;
  }

  validateUnifiConfig(unifi, action);

  const results = [];
  for (const device of devices) {
    results.push(await applyDeviceAction(device, unifi, action));
  }

  const failed = results.filter((result) => !result.ok);
  lastApply = {
    ok: failed.length === 0,
    appliedAt: new Date().toISOString(),
    deviceCount: devices.length,
    mode: "api-key",
    action,
    groupName: target.groupName || null,
    successCount: results.length - failed.length,
    failureCount: failed.length,
    results,
  };

  if (failed.length > 0) {
    lastApply.error = `${failed.length} device action${failed.length === 1 ? "" : "s"} failed`;
  }

  return lastApply;
}

export function getApplyStatus() {
  return lastApply;
}

export async function readDeviceStatuses(devices, serverConfig) {
  const unifi = serverConfig.config?.unifi ?? {};

  if (!serverConfig.loaded) {
    throw new Error(serverConfig.error || "Server configuration is not loaded");
  }

  if (!unifi.enabled) {
    return {
      ok: true,
      mode: "stub",
      checkedAt: new Date().toISOString(),
      results: devices.map((device) => ({
        macAddress: device.macAddress,
        status: normalizeDeviceStatus(device.status),
        ok: true,
        mode: "stub",
      })),
    };
  }

  validateUnifiConfig(unifi, "status");

  const request = buildDeviceStatusRequest(unifi);
  const response = await fetch(request.url, {
    method: request.method,
    headers: {
      Accept: "application/json",
      "X-API-Key": unifi.apiKey,
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        response.statusText ||
        "UniFi status request failed",
    );
  }

  const byMac = new Map(
    extractUnifiDevices(data).map((unifiDevice) => [
      normalizeMacForCompare(unifiDevice.macAddress),
      unifiDevice,
    ]),
  );
  return {
    ok: true,
    mode: "api-key",
    checkedAt: new Date().toISOString(),
    results: devices.map((device) => {
      const unifiDevice = byMac.get(normalizeMacForCompare(device.macAddress));
      return {
        macAddress: device.macAddress,
        status: unifiDevice?.status ?? normalizeDeviceStatus(device.status),
        ok: true,
        found: Boolean(unifiDevice),
      };
    }),
  };
}

export function normalizeDeviceStatus(value) {
  return value === DEVICE_STATUS_BLOCKED
    ? DEVICE_STATUS_BLOCKED
    : DEVICE_STATUS_ALLOWED;
}

function validateUnifiConfig(unifi, action) {
  const missing = [];
  if (!unifi.apiKey) missing.push("apiKey");
  if (!unifi.consoleId) missing.push("consoleId");
  if (action === "status" && !unifi.statusPath && !unifi.site)
    missing.push("site");

  if (missing.length > 0) {
    throw new Error(`UniFi API-key config is missing: ${missing.join(", ")}`);
  }
}

function buildDeviceStatusRequest(unifi) {
  const statusPath =
    unifi.statusPath || `/proxy/network/integration/v1/sites/{site}/clients`;
  return {
    method: "GET",
    url: buildConnectorUrl(
      unifi,
      fillTemplate(statusPath, {
        site: unifi.site,
        legacySite: unifi.legacySite || "default",
      }),
    ),
  };
}

async function applyDeviceAction(device, unifi, action) {
  const request = buildDeviceActionRequest(device, unifi, action);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": unifi.apiKey,
      },
      body: JSON.stringify(request.body),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        macAddress: device.macAddress,
        ok: false,
        status: response.status,
        error: data?.message || data?.error || response.statusText,
      };
    }

    return {
      macAddress: device.macAddress,
      ok: true,
      status: response.status,
    };
  } catch (error) {
    return {
      macAddress: device.macAddress,
      ok: false,
      error: error.message,
    };
  }
}

function buildDeviceActionRequest(device, unifi, action) {
  const configuredPath = unifi[`${action}Path`];
  if (configuredPath) {
    return {
      method: "POST",
      url: buildConnectorUrl(
        unifi,
        fillTemplate(configuredPath, {
          action,
          mac: device.macAddress,
          macAddress: device.macAddress,
          macCompact: device.macAddress.replaceAll(":", ""),
        }),
      ),
      body: {
        action,
        mac: device.macAddress,
        macAddress: device.macAddress,
      },
    };
  }

  const legacySite = unifi.legacySite || "default";
  return {
    method: "POST",
    url: buildConnectorUrl(
      unifi,
      `/proxy/network/api/s/${encodeURIComponent(legacySite)}/cmd/stamgr`,
    ),
    body: {
      cmd: action === "block" ? "block-sta" : "unblock-sta",
      mac: device.macAddress.toLowerCase(),
    },
  };
}

function buildConnectorUrl(unifi, actionPath) {
  const baseUrl = String(unifi.apiBaseUrl || "https://api.ui.com").replace(
    /\/$/,
    "",
  );
  const normalizedPath = String(actionPath).replace(/^\//, "");
  return `${baseUrl}/v1/connector/consoles/${encodeURIComponent(unifi.consoleId)}/${normalizedPath}`;
}

function fillTemplate(value, replacements) {
  return String(value).replace(
    /\{(macAddress|macCompact|mac|action|site|legacySite)\}/g,
    (_match, key) => encodeURIComponent(replacements[key]),
  );
}

function extractUnifiDevices(data) {
  const candidates = [
    data,
    data?.data,
    data?.clients,
    data?.devices,
    data?.data?.clients,
    data?.data?.devices,
  ];
  const list = candidates.find((candidate) => Array.isArray(candidate)) || [];
  return list
    .map((item) => ({
      macAddress: item.mac || item.macAddress || item.id,
      status: statusFromUnifiDevice(item),
    }))
    .filter((item) => item.macAddress && item.status);
}

function statusFromUnifiDevice(item) {
  if (item.blocked === true || item.isBlocked === true || item.blockedAt)
    return DEVICE_STATUS_BLOCKED;
  if (item.blocked === false || item.isBlocked === false)
    return DEVICE_STATUS_ALLOWED;

  const text = String(
    item.status ||
      item.state ||
      item.authorizationStatus ||
      item.networkStatus ||
      "",
  ).toLowerCase();
  if (text.includes("blocked")) return DEVICE_STATUS_BLOCKED;
  if (
    text.includes("allow") ||
    text.includes("authorized") ||
    text.includes("connected")
  )
    return DEVICE_STATUS_ALLOWED;

  return null;
}

function normalizeMacForCompare(macAddress) {
  return String(macAddress || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .toLowerCase();
}
