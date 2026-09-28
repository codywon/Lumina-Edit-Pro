export interface ReleaseAsset {
  id?: number;
  name: string;
  url: string;
  size: number;
  downloadCount?: number;
  browserDownloadUrl: string;
}

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  assetUrl: string;
  assetName: string;
  assetSize: number;
  htmlUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestRelease?: ReleaseInfo;
  error?: string;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface CurrentExeInfo {
  exePath: string;
  exeDir: string;
  exeName: string;
}
