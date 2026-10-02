import { isTauriRuntime } from '../native';
import { getNativeInvoke } from '../native';
import { CurrentExeInfo, DownloadProgress, ReleaseInfo, UpdateCheckResult } from './types';
import { isNewerVersion } from './version';

export const CURRENT_APP_VERSION = '1.1.1';
export const DEFAULT_UPDATE_FEED_URL = 'https://api.github.com/repos/codywon/Lumina-Edit-Pro/releases/latest';

export async function getCurrentExeInfo(): Promise<CurrentExeInfo | null> {
  if (!isTauriRuntime()) return null;
  try {
    const invoke = getNativeInvoke();
    return await invoke<CurrentExeInfo>('app_get_exe_info');
  } catch (err) {
    console.warn('Failed to get exe info:', err);
    return null;
  }
}

export async function checkForUpdate(options: {
  feedUrl?: string;
  githubToken?: string;
} = {}): Promise<UpdateCheckResult> {
  const url = options.feedUrl?.trim() || DEFAULT_UPDATE_FEED_URL;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };

  const token = options.githubToken?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        return {
          hasUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          error: '未找到发布版本记录，当前可能已是最新版本',
        };
      }
      return {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        error: `检查更新失败 (HTTP ${res.status}): ${res.statusText}`,
      };
    }

    const data = await res.json();
    const tagName = data.tag_name || '';
    const version = tagName.replace(/^[vV]/, '');
    const body = data.body || '';
    const name = data.name || tagName;
    const publishedAt = data.published_at || '';
    const htmlUrl = data.html_url || '';

    // Find the Windows executable asset
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const exeAsset =
      assets.find((a: any) => a.name?.toLowerCase().endsWith('.exe')) ||
      assets[0];

    const latestRelease: ReleaseInfo = {
      version,
      tagName,
      name,
      body,
      publishedAt,
      assetUrl: exeAsset?.browser_download_url || htmlUrl,
      assetName: exeAsset?.name || 'Lumina-Edit-Pro.exe',
      assetSize: exeAsset?.size || 0,
      htmlUrl,
    };

    const hasUpdate = isNewerVersion(version, CURRENT_APP_VERSION);

    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease,
    };
  } catch (err: any) {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_APP_VERSION,
      error: err?.message || '网络连接失败，请检查网络设置',
    };
  }
}

export async function downloadUpdate(
  assetUrl: string,
  totalExpectedBytes: number,
  onProgress?: (progress: DownloadProgress) => void,
  abortSignal?: AbortSignal,
  githubToken?: string
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('仅在桌面客户端环境下支持自动下载与安装');
  }

  const invoke = getNativeInvoke();
  const headers: Record<string, string> = {};
  if (githubToken?.trim()) {
    headers.Authorization = `Bearer ${githubToken.trim()}`;
  }

  const response = await fetch(assetUrl, {
    headers,
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`下载新版本失败 (HTTP ${response.status}): ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length')) || totalExpectedBytes || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法创建数据流下载器');
  }

  let receivedBytes = 0;
  let isFirst = true;

  while (true) {
    if (abortSignal?.aborted) {
      await cancelUpdate();
      throw new Error('下载已由用户取消');
    }

    const { done, value } = await reader.read();
    if (done) break;

    if (value && value.length > 0) {
      receivedBytes += value.length;
      const percent = contentLength > 0
        ? Math.min(100, Math.round((receivedBytes / contentLength) * 100))
        : 50;

      onProgress?.({
        receivedBytes,
        totalBytes: contentLength,
        percent,
      });

      // Write chunk to native temp file (.new)
      await invoke<void>('app_write_update_chunk', {
        payload: {
          chunk: Array.from(value),
          isFirst,
        },
      });

      isFirst = false;
    }
  }

  onProgress?.({
    receivedBytes,
    totalBytes: contentLength || receivedBytes,
    percent: 100,
  });
}

export async function cancelUpdate(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const invoke = getNativeInvoke();
    await invoke<void>('app_cancel_update');
  } catch (err) {
    console.warn('Cancel update warning:', err);
  }
}

export async function applyUpdateAndRestart(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('仅在桌面客户端环境下支持自动替换并重启');
  }
  const invoke = getNativeInvoke();
  await invoke<void>('app_apply_update_and_restart');
}

export async function saveUpdateAs(targetPath: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('仅在桌面客户端环境下支持另存为文件');
  }
  const invoke = getNativeInvoke();
  await invoke<void>('app_save_update_as', {
    payload: { targetPath },
  });
}
