import type { AudioStorage, CacheStats, CachedAudio, NoteCacheInfo } from './storage';

/**
 * IndexedDB 音频缓存（桌面/移动一致）。
 * 单 store 设计：每条记录自带 notePath，按笔记统计/清理/改名都是一次游标遍历，
 * 不需要单独的反向索引，也就不存在索引与音频不一致的问题。
 */

const DB_NAME = 'voice-aloud';
const DB_VERSION = 1;
const STORE = 'audio';

interface AudioRecord {
  key: string;
  blob: Blob;
  mime: string;
  createdAt: number;
  bytes: number;
  notePath: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    });
    return result;
  } finally {
    db.close();
  }
}

async function cursorWalk(
  onEach: (rec: AudioRecord, store: IDBObjectStore) => void,
): Promise<void> {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        onEach(cursor.value as AudioRecord, store);
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error('indexedDB cursor failed'));
    });
  });
}

export class IndexedDbAudioStorage implements AudioStorage {
  async get(key: string): Promise<CachedAudio | null> {
    const rec = await withStore('readonly', (store) =>
      wrap(store.get(key) as IDBRequest<AudioRecord | undefined>),
    );
    if (!rec) return null;
    return { blob: rec.blob, mime: rec.mime };
  }

  async put(key: string, blob: Blob, mime: string, notePath: string): Promise<void> {
    const rec: AudioRecord = {
      key,
      blob,
      mime,
      createdAt: Date.now(),
      bytes: blob.size,
      notePath,
    };
    await withStore('readwrite', (store) => wrap(store.put(rec)));
  }

  async clearAll(): Promise<void> {
    await withStore('readwrite', (store) => wrap(store.clear()));
  }

  async stats(): Promise<CacheStats> {
    let entries = 0;
    let bytes = 0;
    await cursorWalk((rec) => {
      if (rec && typeof rec === 'object') {
        entries++;
        bytes += rec.bytes ?? rec.blob?.size ?? 0;
      }
    });
    return { entries, bytes };
  }

  async listByNote(): Promise<NoteCacheInfo[]> {
    const byNote = new Map<string, NoteCacheInfo>();
    await cursorWalk((rec) => {
      if (!rec || typeof rec !== 'object') return;
      const path = rec.notePath ?? '(未知笔记)';
      const cur = byNote.get(path) ?? { notePath: path, entries: 0, bytes: 0, updatedAt: 0 };
      cur.entries++;
      cur.bytes += rec.bytes ?? rec.blob?.size ?? 0;
      cur.updatedAt = Math.max(cur.updatedAt, rec.createdAt ?? 0);
      byNote.set(path, cur);
    });
    return Array.from(byNote.values()).sort((a, b) => b.bytes - a.bytes);
  }

  async removeNote(notePath: string): Promise<number> {
    let removed = 0;
    await cursorWalk((rec, store) => {
      if (rec && rec.notePath === notePath) {
        store.delete(rec.key);
        removed++;
      }
    });
    return removed;
  }

  async renameNote(oldPath: string, newPath: string): Promise<void> {
    await cursorWalk((rec, store) => {
      if (rec && rec.notePath === oldPath) {
        store.put({ ...rec, notePath: newPath });
      }
    });
  }

  close(): void {
    /* 每次操作独立开关连接，无需显式关闭 */
  }
}
