/**
 * Azure 音色清单（用户可编辑的配置文件）。
 *
 * Azure 一个订阅常有 900+ 个音色，播放面板的下拉无法使用。插件目录下的
 * `azure-voices.json` 让用户自己挑音色、自己命名：
 *
 * ```json
 * {
 *   "version": 1,
 *   "voices": [
 *     { "id": "zh-CN-Xiaoxiao:DragonHDFlashLatestNeural", "name": "晓晓 最新神经语音" },
 *     { "id": "en-US-AndrewMultilingualNeural" }
 *   ]
 * }
 * ```
 *
 * `name` 可省略：中文音色建议写中文名；其他语言省略后按 ID 自动格式化成
 * 可读英文（`en-US-AndrewMultilingualNeural` → `Andrew Multilingual Neural`）。
 * 兼容三种写法（手改时不必记格式）：
 * - `{ "voices": [ { "id", "name" } ] }`（推荐，顺序即下拉顺序）
 * - `[ { "id", "name" } ]` 或 `[ "音色ID", ... ]`（无名称时显示 ID）
 * - `{ "音色ID": "名称" }`（纯映射）
 */

/** 播放面板下拉的一项：值用 id，显示用 label。 */
export interface VoiceOption {
  id: string;
  label: string;
}

/** 配置文件放在插件目录下（与 main.js 同级）。 */
export const AZURE_VOICE_CATALOG_FILE = 'azure-voices.json';

/** 需要拆开显示的模型/属性词。人格名（Andrew、SunHi、JiMin）不在其中，保持原样。 */
const MODEL_TOKENS = /(Dragon|HD|Flash|Omni|Multilingual|Turbo|Neural|Latest)/g;

const LOCALE_LANG = /^[a-z]{2,3}$/;
const LOCALE_REGION = /^[A-Za-z]{2,4}$/;
const LOCALE_DIALECT = /^[a-z]{3,10}$/;

/** 去掉开头的 locale 段：`en-US-` / `zh-CN-liaoning-` / `ja-JP-`。 */
function stripLocale(id: string): string {
  const segs = id.split('-');
  if (segs.length < 2 || !LOCALE_LANG.test(segs[0])) return id;
  let i = 1;
  if (LOCALE_REGION.test(segs[1] ?? '')) i = 2;
  // 方言段（liaoning / sichuan / henan …）全是小写且比地区段长
  while (i < segs.length - 1 && LOCALE_DIALECT.test(segs[i] ?? '')) i += 1;
  return segs.slice(i).join('-');
}

/**
 * 把音色 ID 格式化成可读名称（中文以外的语言用这一套，不翻译）：
 * `en-US-AndrewMultilingualNeural` → `Andrew Multilingual Neural`
 * `en-US-Ava:DragonHDLatestNeural` → `Ava Dragon HD Latest Neural`
 * `ko-KR-SunHiNeural` → `SunHi Neural`
 */
export function formatVoiceLabel(id: string): string {
  const rest = stripLocale(id.trim()).replace(/[:]/g, ' ');
  const spaced = rest.replace(MODEL_TOKENS, (t) => ` ${t}`);
  return spaced.replace(/\s+/g, ' ').trim() || id.trim();
}

/** 音色 ID 的语言子标签：`en-US-…` → en，`zh-CN-liaoning-…` → zh。 */
export function langTagOf(id: string): string | null {
  const m = /^([a-z]{2,3})(?:[-_:]|$)/.exec((id ?? '').trim());
  return m ? m[1] : null;
}

/**
 * 下拉里最终显示的文字：`语言~ 名称`，例如 `en~ Ana Neural`、`zh~ 晓晓 多语言`。
 * 名称来自配置文件（中文音色写中文名），缺省时按 ID 自动格式化。
 * 已经是 `xx~` 开头的名称不再重复加前缀（便于直接粘贴已显示的文字）。
 */
export function displayLabel(id: string, name?: unknown): string {
  const key = id.trim();
  const base =
    typeof name === 'string' && name.trim() ? name.trim() : formatVoiceLabel(key);
  if (/^[a-z]{2,3}~\s/.test(base)) return base;
  const lang = langTagOf(key);
  return lang ? `${lang}~ ${base}` : base;
}

function toOption(id: unknown, name: unknown): VoiceOption | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const key = id.trim();
  // name 可省略：缺省按 ID 自动格式化；两种来源都会加 `语言~` 前缀
  return { id: key, label: displayLabel(key, name) };
}

/** 去空、去重（同 id 保留首次出现的名称与位置）。 */
function normalize(items: Array<VoiceOption | null>): VoiceOption[] | null {
  const seen = new Set<string>();
  const out: VoiceOption[] = [];
  for (const it of items) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out.length ? out : null;
}

/** 解析配置文件内容；无法识别时返回 null（调用方回退到内置逻辑）。 */
export function parseVoiceCatalog(json: unknown): VoiceOption[] | null {
  if (Array.isArray(json)) {
    return normalize(
      json.map((item) => {
        if (typeof item === 'string') return toOption(item, undefined);
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          return toOption(o['id'] ?? o['ShortName'] ?? o['voice'], o['name'] ?? o['label']);
        }
        return null;
      }),
    );
  }
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj['voices'])) return parseVoiceCatalog(obj['voices']);
    // 纯映射写法：键是音色 ID（必含连字符），跳过 version/note 之类的说明字段
    const entries = Object.entries(obj).filter(([k]) => k.includes('-'));
    return normalize(entries.map(([k, v]) => toOption(k, v)));
  }
  return null;
}

/** 在清单里按 id 取显示名；找不到时回退 id。 */
export function labelFor(catalog: VoiceOption[] | null, id: string): string {
  return catalog?.find((v) => v.id === id)?.label ?? id;
}
