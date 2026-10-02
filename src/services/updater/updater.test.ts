import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compareVersions, isNewerVersion } from './version';
import { checkForUpdate, CURRENT_APP_VERSION } from './client';

describe('Updater: Version Comparison', () => {
  it('correctly compares semantic versions with or without v prefix', () => {
    expect(compareVersions('v1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', 'v1.0.1')).toBe(-1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });

  it('handles multi-digit version numbers accurately', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.2.15', '1.2.9')).toBe(1);
    expect(compareVersions('1.0.100', '1.0.99')).toBe(1);
  });

  it('determines if remote release is newer than current', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
    expect(isNewerVersion('v2.0.0', '1.0.0')).toBe(true);
  });
});

describe('Updater: Check for Updates Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects a newer version from GitHub release payload', async () => {
    const mockRelease = {
      tag_name: 'v1.2.0',
      name: 'Lumina Edit Pro v1.2.0',
      body: '### New features\n- Auto-update support',
      published_at: '2026-09-28T12:00:00Z',
      html_url: 'https://github.com/codywon/Lumina-Edit-Pro/releases/tag/v1.2.0',
      assets: [
        {
          name: 'Lumina-Edit-Pro.exe',
          size: 14500000,
          browser_download_url: 'https://github.com/codywon/Lumina-Edit-Pro/releases/download/v1.2.0/Lumina-Edit-Pro.exe',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRelease,
    } as any);

    const result = await checkForUpdate();

    expect(result.hasUpdate).toBe(true);
    expect(result.currentVersion).toBe(CURRENT_APP_VERSION);
    expect(result.latestRelease?.version).toBe('1.2.0');
    expect(result.latestRelease?.assetName).toBe('Lumina-Edit-Pro.exe');
    expect(result.latestRelease?.assetSize).toBe(14500000);
  });

  it('recognizes when current version is already up to date', async () => {
    const mockRelease = {
      tag_name: 'v1.1.3',
      name: 'Lumina Edit Pro v1.1.3',
      body: 'Initial release',
      assets: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRelease,
    } as any);

    const result = await checkForUpdate();

    expect(result.hasUpdate).toBe(false);
    expect(result.latestRelease?.version).toBe('1.1.3');
  });

  it('handles 404 or network errors gracefully with informative message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as any);

    const result = await checkForUpdate();

    expect(result.hasUpdate).toBe(false);
    expect(result.error).toContain('未找到发布版本记录');
  });
});
