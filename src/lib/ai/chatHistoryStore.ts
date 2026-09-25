import type { AIChatHistory, AIMessage } from './types';

const DB_NAME = 'lumina-ai';
const DB_VERSION = 1;
const STORE_NAME = 'records';
const CHAT_HISTORY_RECORD_ID = 'chat-history';
const DATA_IMAGE_URL_PATTERN = /data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);base64,[^\s)"']+/gi;

function normalizeChatHistory(parsed: AIChatHistory): AIChatHistory {
  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    return {};
  }

  const hasScopedKeys = keys.some((key) => key === 'global' || key.startsWith('doc:'));
  if (hasScopedKeys) {
    return parsed;
  }

  const merged = keys.flatMap((key) => parsed[key] ?? []);
  return merged.length ? { global: merged } : {};
}

function getIndexedDB() {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase | null> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readIndexedDBChatHistory(): Promise<AIChatHistory | null> {
  const database = await openDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(CHAT_HISTORY_RECORD_ID);

    request.onsuccess = () => {
      const value = request.result as AIChatHistory | undefined;
      resolve(value ? normalizeChatHistory(value) : null);
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function writeIndexedDBChatHistory(history: AIChatHistory) {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(history, CHAT_HISTORY_RECORD_ID);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}

function createLightweightLocalMirror(history: AIChatHistory): AIChatHistory {
  const mirror: AIChatHistory = {};

  for (const [key, messages] of Object.entries(history)) {
    mirror[key] = messages.map((message: AIMessage) => ({
      ...message,
      content: message.content.replace(DATA_IMAGE_URL_PATTERN, '[图片已保存在本机缓存，正在恢复完整记录]'),
    }));
  }

  return mirror;
}

export function loadChatHistoryFromLocalStorage(storageKey: string): AIChatHistory {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    return normalizeChatHistory(JSON.parse(raw) as AIChatHistory);
  } catch {
    return {};
  }
}

export async function loadChatHistoryFromPersistentStore(storageKey: string): Promise<AIChatHistory> {
  const indexedHistory = await readIndexedDBChatHistory();
  if (indexedHistory) {
    return indexedHistory;
  }

  return loadChatHistoryFromLocalStorage(storageKey);
}

export async function persistChatHistoryToPersistentStore(storageKey: string, history: AIChatHistory) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch {
    try {
      localStorage.setItem(storageKey, JSON.stringify(createLightweightLocalMirror(history)));
    } catch {
      // Ignore localStorage quota/private-mode failures; IndexedDB below is the durable store for large image chats.
    }
  }

  await writeIndexedDBChatHistory(history);
}

