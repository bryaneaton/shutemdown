let lastApply = null;

export async function applyDeviceList(devices, serverConfig, action = 'block', target = {}) {
  const unifi = serverConfig.config?.unifi ?? {};

  if (!serverConfig.loaded) {
    throw new Error(serverConfig.error || 'Server configuration is not loaded');
  }

  if (!unifi.enabled) {
    lastApply = {
      ok: true,
      appliedAt: new Date().toISOString(),
      deviceCount: devices.length,
      mode: 'stub',
      action,
      groupName: target.groupName || null,
      results: devices.map((device) => ({ macAddress: device.macAddress, ok: true, mode: 'stub' }))
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
    mode: 'api-key',
    action,
    groupName: target.groupName || null,
    successCount: results.length - failed.length,
    failureCount: failed.length,
    results
  };

  if (failed.length > 0) {
    lastApply.error = `${failed.length} device action${failed.length === 1 ? '' : 's'} failed`;
  }

  return lastApply;
}

export function getApplyStatus() {
  return lastApply;
}

function validateUnifiConfig(unifi, action) {
  const missing = [];
  if (!unifi.apiKey) missing.push('apiKey');
  if (!unifi.consoleId) missing.push('consoleId');

  if (missing.length > 0) {
    throw new Error(`UniFi API-key config is missing: ${missing.join(', ')}`);
  }
}

async function applyDeviceAction(device, unifi, action) {
  const request = buildDeviceActionRequest(device, unifi, action);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': unifi.apiKey
      },
      body: JSON.stringify(request.body)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        macAddress: device.macAddress,
        ok: false,
        status: response.status,
        error: data?.message || data?.error || response.statusText
      };
    }

    return {
      macAddress: device.macAddress,
      ok: true,
      status: response.status
    };
  } catch (error) {
    return {
      macAddress: device.macAddress,
      ok: false,
      error: error.message
    };
  }
}

function buildDeviceActionRequest(device, unifi, action) {
  const configuredPath = unifi[`${action}Path`];
  if (configuredPath) {
    return {
      method: 'POST',
      url: buildConnectorUrl(unifi, fillTemplate(configuredPath, {
        action,
        mac: device.macAddress,
        macAddress: device.macAddress,
        macCompact: device.macAddress.replaceAll(':', '')
      })),
      body: {
        action,
        mac: device.macAddress,
        macAddress: device.macAddress
      }
    };
  }

  const legacySite = unifi.legacySite || 'default';
  return {
    method: 'POST',
    url: buildConnectorUrl(unifi, `/proxy/network/api/s/${encodeURIComponent(legacySite)}/cmd/stamgr`),
    body: {
      cmd: action === 'block' ? 'block-sta' : 'unblock-sta',
      mac: device.macAddress.toLowerCase()
    }
  };
}

function buildConnectorUrl(unifi, actionPath) {
  const baseUrl = String(unifi.apiBaseUrl || 'https://api.ui.com').replace(/\/$/, '');
  const normalizedPath = String(actionPath).replace(/^\//, '');
  return `${baseUrl}/v1/connector/consoles/${encodeURIComponent(unifi.consoleId)}/${normalizedPath}`;
}

function fillTemplate(value, replacements) {
  return String(value).replace(/\{(macAddress|macCompact|mac|action)\}/g, (_match, key) => encodeURIComponent(replacements[key]));
}
