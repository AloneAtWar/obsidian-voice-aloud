import { zh } from './zh';

/** 取文案；支持 {name} 插值。缺失的 key 直接回显 key，便于发现遗漏。 */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
