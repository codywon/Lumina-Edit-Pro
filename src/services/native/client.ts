import type {
  DefaultEditorResult,
  NativeAppHealth,
  NativeCliFile,
  NativeInvokeClient,
  NetworkDownloadPayload,
  NetworkDownloadResult,
  NetworkFetchPayload,
  NetworkFetchResult,
} from './types';
import { isTauriRuntime } from './environment';
import { getNativeInvoke } from './invoke';

export function createNativeClient(): NativeInvokeClient {
  return {
    async appHealth(): Promise<NativeAppHealth> {
      if (!isTauriRuntime()) {
        return {
          appName: 'Lumina Edit Pro',
          version: 'web',
          status: 'browser-runtime',
        };
      }

      const invoke = getNativeInvoke();
      return await invoke<NativeAppHealth>('app_health');
    },

    async setWindowTitle(title: string): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_set_window_title', { title });
    },

    async minimizeWindow(): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_window_minimize');
    },

    async toggleMaximizeWindow(): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_window_toggle_maximize');
    },

    async closeWindow(): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_window_close');
    },

    async startWindowDrag(): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_window_start_dragging');
    },

    async getCliOpenFile(): Promise<NativeCliFile | null> {
      if (!isTauriRuntime()) {
        return null;
      }

      const invoke = getNativeInvoke();
      return await invoke<NativeCliFile | null>('app_get_cli_open_file');
    },

    async setAsDefaultEditor(): Promise<DefaultEditorResult> {
      if (!isTauriRuntime()) {
        return {
          success: false,
          message: '请在桌面客户端环境中使用设为默认编辑器功能',
        };
      }

      const invoke = getNativeInvoke();
      return await invoke<DefaultEditorResult>('app_set_as_default_editor');
    },

    async openDefaultAppsSettings(): Promise<void> {
      if (!isTauriRuntime()) {
        return;
      }

      const invoke = getNativeInvoke();
      await invoke<void>('app_open_default_apps_settings');
    },
  };
}

export const nativeClient = createNativeClient();

export async function setNativeWindowTitle(title: string) {
  await nativeClient.setWindowTitle(title);
}

export async function minimizeNativeWindow() {
  await nativeClient.minimizeWindow();
}

export async function toggleMaximizeNativeWindow() {
  await nativeClient.toggleMaximizeWindow();
}

export async function closeNativeWindow() {
  await nativeClient.closeWindow();
}

export async function startNativeWindowDrag() {
  await nativeClient.startWindowDrag();
}

export async function getNativeCliOpenFile(): Promise<NativeCliFile | null> {
  return await nativeClient.getCliOpenFile();
}

export async function setNativeAsDefaultEditor(): Promise<DefaultEditorResult> {
  return await nativeClient.setAsDefaultEditor();
}

export async function openNativeDefaultAppsSettings(): Promise<void> {
  await nativeClient.openDefaultAppsSettings();
}

export async function networkFetchText(payload: NetworkFetchPayload): Promise<NetworkFetchResult> {
  if (isTauriRuntime()) {
    const invoke = getNativeInvoke();
    return await invoke<NetworkFetchResult>('network_fetch_text', { payload });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(payload.url, {
      headers: payload.headers,
      signal: controller.signal,
    });

    const content = await res.text();
    return {
      status: res.status,
      content,
      contentType: res.headers.get('content-type') || '',
      finalUrl: res.url || payload.url,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function networkDownloadAsset(payload: NetworkDownloadPayload): Promise<NetworkDownloadResult> {
  if (isTauriRuntime()) {
    const invoke = getNativeInvoke();
    return await invoke<NetworkDownloadResult>('network_download_asset', { payload });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(payload.url, {
      headers: payload.headers,
      signal: controller.signal,
    });

    const arrayBuf = await res.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuf));
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      size: bytes.length,
      bytes,
      savedPath: payload.targetFilePath,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
