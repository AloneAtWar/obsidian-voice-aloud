/** 音频缓存存储抽象：V1 提供 IndexedDB 实现，接口为将来 vault 存储等留口。 */

export interface CachedAudio {
  blob: Blob;
  mime: string;
}

export interface NoteCacheInfo {
  notePath: string;
  entries: number;
  bytes: number;
  updatedAt: number;
}

export interface CacheStats {
  entries: number;
  bytes: number;
}

export interface AudioStorage {
  get(key: string): Promise<CachedAudio | null>;
  put(key: string, blob: Blob, mime: string, notePath: string): Promise<void>;
  clearAll(): Promise<void>;
  stats(): Promise<CacheStats>;
  listByNote(): Promise<NoteCacheInfo[]>;
  /** 删除某篇笔记的全部缓存，返回删除条数。 */
  removeNote(notePath: string): Promise<number>;
  renameNote(oldPath: string, newPath: string): Promise<void>;
  close(): void;
}
