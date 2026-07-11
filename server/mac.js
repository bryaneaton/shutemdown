const MAC_GROUPS = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;

export function normalizeMacAddress(value) {
  if (typeof value !== 'string') {
    throw new Error('MAC address must be a string');
  }

  const compact = value.trim().replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (compact.length !== 12 || !/^[0-9A-F]{12}$/.test(compact)) {
    throw new Error(`Invalid MAC address: ${value}`);
  }

  const normalized = compact.match(/.{2}/g).join(':');
  if (!MAC_GROUPS.test(normalized)) {
    throw new Error(`Invalid MAC address: ${value}`);
  }

  return normalized;
}

export function parseMacAddressText(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
