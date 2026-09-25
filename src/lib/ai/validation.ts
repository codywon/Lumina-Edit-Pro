export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const noTrailingSlash = withProtocol.replace(/\/+$/, '');
  return noTrailingSlash.replace(/\/v1$/i, '');
}

export function isValidBaseUrl(value: string) {
  if (!value.trim()) {
    return false;
  }
  try {
    const url = new URL(normalizeBaseUrl(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidApiKey(value: string) {
  return value.trim().length >= 6;
}

export function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 6) {
    return '******';
  }
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}
