const MAC_FORMATS = [
  /^[0-9A-F]{12}$/,
  /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/,
  /^[0-9A-F]{2}(-[0-9A-F]{2}){5}$/,
  /^[0-9A-F]{4}(\.[0-9A-F]{4}){2}$/
];

export function normalizeMacAddress(value) {
  if (typeof value !== 'string') {
    throw new Error('MAC address must be a string');
  }

  const raw = value.trim().toUpperCase();
  if (!MAC_FORMATS.some((format) => format.test(raw))) {
    throw new Error(`Invalid MAC address: ${value}`);
  }

  return raw.replace(/[:.-]/g, '').match(/.{2}/g).join(':');
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
