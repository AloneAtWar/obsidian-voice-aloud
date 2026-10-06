import {
  sameOwner,
  type AudioStorage,
  type CacheOwner,
  type CacheStats,
  type CachedAudio,
  type NoteCacheInfo,
} from './storage';

/**
 * IndexedDB 音频缓存（桌面/移动一致）。
 * v2：记录自带 notePath + 归属（账号/音色），按笔记×配置统计/清理/改名都是游标遍历。
 * 从 v1 升级时旧记录缺归属字段，直接清空重建（缓存可再生）。
 */

const DB_NAME = 'voice-aloud';
const DB_VERSION = 2;
const STORE = 'audio';

interface AudioRecord {
  key: string;
  blob: Blob;
  mime: string;
  createdAt: number;
  bytes: number;
  notePath: string;
  owner: CacheOwner;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 记录没有 owner 字段，无法归类 → 清空重建
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }
      db.createObjectStore(STORE, { keyPath: 'key' });
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

  async hasMany(keys: string[]): Promise<Set<string>> {
    if (!keys.length) return new Set();
    const wanted = new Set(keys);
    const found = new Set<string>();
    await cursorWalk((rec) => {
      if (rec && wanted.has(rec.key)) found.add(rec.key);
    });
    return found;
  }

  async put(
    key: string,
    blob: Blob,
    mime: string,
    notePath: string,
    owner: CacheOwner,
  ): Promise<void> {
    const rec: AudioRecord = {
      key,
      blob,
      mime,
      createdAt: Date.now(),
      bytes: blob.size,
      notePath,
      owner,
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

  async listByNote(owner?: CacheOwner): Promise<NoteCacheInfo[]> {
    const byKey = new Map<string, NoteCacheInfo>();
    await cursorWalk((rec) => {
      if (!rec || typeof rec !== 'object') return;
      const recOwner = rec.owner ?? { accountId: '?', accountName: '?', voice: '?' };
      if (owner && !sameOwner(owner, recOwner)) return;
      const path = rec.notePath ?? '(未知笔记)';
      const mapKey = `${path}\u0000${recOwner.accountId}\u0000${recOwner.voice}`;
      const cur = byKey.get(mapKey) ?? {
        notePath: path,
        owner: recOwner,
        entries: 0,
        bytes: 0,
        updatedAt: 0,
      };
      cur.entries++;
      cur.bytes += rec.bytes ?? rec.blob?.size ?? 0;
      cur.updatedAt = Math.max(cur.updatedAt, rec.createdAt ?? 0);
      byKey.set(mapKey, cur);
    });
    return Array.from(byKey.values()).sort((a, b) => b.bytes - a.bytes);
  }

  async removeNote(notePath: string, owner?: CacheOwner): Promise<number> {
    let removed = 0;
    await cursorWalk((rec, store) => {
      if (!rec || rec.notePath !== notePath) return;
      const recOwner = rec.owner;
      if (owner && !sameOwner(owner, recOwner)) return;
      store.delete(rec.key);
      removed++;
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
