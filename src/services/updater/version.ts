/**
 * Parses and compares two semantic version strings (e.g. "v1.0.0" and "1.0.1")
 * Returns:
 *   1 if v1 > v2 (v1 is newer than v2)
 *  -1 if v1 < v2 (v1 is older than v2)
 *   0 if v1 === v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = (v1 || '').trim().replace(/^[vV]/, '');
  const clean2 = (v2 || '').trim().replace(/^[vV]/, '');

  if (clean1 === clean2) {
    return 0;
  }

  // Split into core version and prerelease tag: "1.0.0-beta.1" -> ["1.0.0", "beta.1"]
  const [core1, pre1] = clean1.split('-');
  const [core2, pre2] = clean2.split('-');

  const parts1 = core1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = core2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  // If core versions are identical, standard release > prerelease (e.g. 1.0.0 > 1.0.0-beta)
  if (!pre1 && pre2) return 1;
  if (pre1 && !pre2) return -1;
  if (pre1 && pre2) {
    return pre1.localeCompare(pre2);
  }

  return 0;
}

/**
 * Checks if remoteVersion is strictly newer than currentVersion
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  return compareVersions(remoteVersion, currentVersion) > 0;
}
