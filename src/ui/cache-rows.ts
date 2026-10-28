import type { NoteCacheInfo } from '../core/cache/storage';

/** 按显示名做自然排序（数字按数值比较：`2 条` 不会排在 `10 条` 后面）。 */
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/**
 * 缓存行排序：按音色显示名（面板上看到的名字）升序，同名时依次用音色 ID、
 * 账号名、账号 ID 兜底，保证同一份内容每次渲染的顺序完全一致。
 *
 * 不能用条目数/体积排序：播放时缓存持续增长，同一份音色列表每次展开的顺序都会变
 * （「多展开几次顺序就变了」）。显示名来自音色清单，与缓存内容无关，因此稳定。
 */
export function sortCacheRows(
  rows: readonly NoteCacheInfo[],
  labelOf: (row: NoteCacheInfo) => string,
): NoteCacheInfo[] {
  return [...rows].sort((a, b) => {
    const byLabel = collator.compare(labelOf(a), labelOf(b));
    if (byLabel !== 0) return byLabel;
    const byVoice = collator.compare(a.owner.voice, b.owner.voice);
    if (byVoice !== 0) return byVoice;
    const byAccountName = collator.compare(a.owner.accountName ?? '', b.owner.accountName ?? '');
    if (byAccountName !== 0) return byAccountName;
    return collator.compare(a.owner.accountId, b.owner.accountId);
  });
}
