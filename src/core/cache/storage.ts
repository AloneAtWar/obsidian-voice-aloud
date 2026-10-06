/** 音频缓存存储抽象：V1 提供 IndexedDB 实现，接口为将来 vault 存储等留口。 */

export interface CachedAudio {
  blob: Blob;
  mime: string;
}

/** 缓存归属：哪个账号（含名称快照）用哪个音色/配置合成。 */
export interface CacheOwner {
  accountId: string;
  accountName: string;
  voice: string;
}

export function sameOwner(a: CacheOwner | undefined, b: CacheOwner | undefined): boolean {
  if (!a || !b) return false;
  return a.accountId === b.accountId && a.voice === b.voice;
}

/** 笔记 × 配置 维度的缓存信息。 */
export interface NoteCacheInfo {
  notePath: string;
  owner: CacheOwner;
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
  /** 批量查询已存在的 key（预生成队列计算任务进度用）。 */
  hasMany(keys: string[]): Promise<Set<string>>;
  put(key: string, blob: Blob, mime: string, notePath: string, owner: CacheOwner): Promise<void>;
  clearAll(): Promise<void>;
  stats(): Promise<CacheStats>;
  /** 按笔记 × 配置列出；owner 提供时仅统计该配置。 */
  listByNote(owner?: CacheOwner): Promise<NoteCacheInfo[]>;
  /** 删除某篇笔记（在指定配置下）的全部缓存，返回删除条数。 */
  removeNote(notePath: string, owner?: CacheOwner): Promise<number>;
  renameNote(oldPath: string, newPath: string): Promise<void>;
  close(): void;
}
