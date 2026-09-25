import { isTauriRuntime } from '../services/native';

const DB_NAME = 'lumina-workspace';
const STORE_NAME = 'handles';
const LAST_WORKSPACE_KEY = 'last-directory';

function openDb() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB not supported'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveWorkspaceHandle(handle: any) {
  if (isTauriRuntime()) return;
  if (!handle) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(handle, LAST_WORKSPACE_KEY);
    });
    db.close();
  } catch {
    // Ignore persistence failures
  }
}

export async function loadWorkspaceHandle() {
  if (isTauriRuntime()) return null;
  try {
    const db = await openDb();
    const handle = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(LAST_WORKSPACE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function clearWorkspaceHandle() {
  if (isTauriRuntime()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(LAST_WORKSPACE_KEY);
    });
    db.close();
  } catch {
    // Ignore persistence failures
  }
}
