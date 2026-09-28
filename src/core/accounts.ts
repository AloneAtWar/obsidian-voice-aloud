import { randomId } from '../util/hash';
import { getProvider, webspeechProvider } from './providers/registry';
import type { TtsAccountConfig, TtsProvider } from './providers/types';

export interface VoiceAloudSettings {
  accounts: TtsAccountConfig[];
  /** 当前使用的账号；null = 系统语音（Web Speech）。切换立即生效（下一次合成取新值）。 */
  activeAccountId: string | null;
  rate: number;
  skipBackSeconds: number;
  /** 跟读模式：开启后正文自动滚动跟随当前朗读句（默认开，保留原有体验）。 */
  followRead: boolean;
}

export const DEFAULT_SETTINGS: VoiceAloudSettings = {
  accounts: [],
  activeAccountId: null,
  rate: 1,
  skipBackSeconds: 15,
  followRead: true,
};

export interface ResolvedVoice {
  provider: TtsProvider;
  account: TtsAccountConfig | null;
}

/** 解析当前生效的语音：activeAccountId 无效/缺失时回退系统语音。 */
export function resolveActive(settings: VoiceAloudSettings): ResolvedVoice {
  const acc = settings.accounts.find((a) => a.id === settings.activeAccountId);
  const provider = acc ? getProvider(acc.providerId) : undefined;
  if (acc && provider) return { provider, account: acc };
  return { provider: webspeechProvider, account: null };
}

export function newAccount(
  providerId: string,
  patch: Partial<TtsAccountConfig> = {},
): TtsAccountConfig {
  const provider = getProvider(providerId);
  const defaults = provider?.defaults() ?? {};
  return {
    id: randomId('acct'),
    name: '',
    providerId,
    voice: '',
    language: 'Chinese',
    ...defaults,
    ...patch,
  };
}
