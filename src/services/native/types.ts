export interface NativeAppHealth {
  appName: string;
  version: string;
  status: string;
}

export interface DefaultEditorResult {
  success: boolean;
  message: string;
}

export interface NativeCliFile {
  path: string;
  name: string;
  content: string;
}

export interface NetworkFetchPayload {
  url: string;
  headers?: Record<string, string>;
}

export interface NetworkFetchResult {
  status: number;
  content: string;
  contentType: string;
  finalUrl: string;
}

export interface NetworkDownloadPayload {
  url: string;
  headers?: Record<string, string>;
  targetFilePath?: string;
}

export interface NetworkDownloadResult {
  status: number;
  contentType: string;
  size: number;
  bytes?: number[];
  savedPath?: string;
}

export interface NativeInvokeClient {
  appHealth(): Promise<NativeAppHealth>;
  setWindowTitle(title: string): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  startWindowDrag(): Promise<void>;
  getCliOpenFile(): Promise<NativeCliFile | null>;
  setAsDefaultEditor(): Promise<DefaultEditorResult>;
  openDefaultAppsSettings(): Promise<void>;
}
