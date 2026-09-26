export interface HistorySnapshot {
  id: string;
  timestamp: number;
  formattedTime: string;
  source: 'save' | 'auto' | 'manual';
  charCount: number;
  preview: string;
  content: string;
}

const STORAGE_PREFIX = 'lumina_history_';
const MAX_SNAPSHOTS_PER_DOC = 30;

function formatTimestamp(time: number): string {
  const d = new Date(time);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (isToday) {
    return `今天 ${timeStr}`;
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${timeStr}`;
}

export function getSnapshots(docKey: string): HistorySnapshot[] {
  if (!docKey) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docKey}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load history snapshots:', e);
    return [];
  }
}

export function saveSnapshot(
  docKey: string,
  content: string,
  source: 'save' | 'auto' | 'manual' = 'save'
): HistorySnapshot | null {
  if (!docKey || !content || content.trim().length === 0) return null;

  try {
    const snapshots = getSnapshots(docKey);
    const now = Date.now();

    // Avoid saving identical snapshots if content is unchanged from the latest snapshot
    if (snapshots.length > 0 && snapshots[0].content === content) {
      return snapshots[0];
    }

    const firstLine = content.split('\n').find((l) => l.trim().length > 0) || '无标题';
    const preview = firstLine.replace(/^[#*`\s-]+/, '').trim().slice(0, 60);

    const newSnapshot: HistorySnapshot = {
      id: `snap_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      formattedTime: formatTimestamp(now),
      source,
      charCount: content.length,
      preview,
      content,
    };

    const updated = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS_PER_DOC);
    localStorage.setItem(`${STORAGE_PREFIX}${docKey}`, JSON.stringify(updated));
    return newSnapshot;
  } catch (e) {
    console.warn('Failed to save history snapshot (storage quota may be full):', e);
    return null;
  }
}

export function deleteSnapshot(docKey: string, snapshotId: string): void {
  if (!docKey || !snapshotId) return;
  try {
    const snapshots = getSnapshots(docKey);
    const updated = snapshots.filter((s) => s.id !== snapshotId);
    localStorage.setItem(`${STORAGE_PREFIX}${docKey}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete snapshot:', e);
  }
}

export function clearSnapshots(docKey: string): void {
  if (!docKey) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${docKey}`);
  } catch (e) {
    console.error('Failed to clear snapshots:', e);
  }
}
