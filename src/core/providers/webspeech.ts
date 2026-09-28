import type { TtsProvider } from './types';

/**
 * 系统离线保底：浏览器/OS 内置 Web Speech（免配置、零成本、离线）。
 * 拿不到音频字节 → 不可缓存、不可预生成；播放走 speakDirect 路径。
 * 桌面端可靠，移动端（尤其 iOS WebView）尽力而为。
 */
export const webspeechProvider: TtsProvider = {
  id: 'webspeech',
  name: '系统语音（Web Speech）',
  capabilities: { cacheable: false, pregeneratable: false, voiceList: false, direct: true },
  defaults: () => ({ voice: '', language: 'Chinese' }),
  async listVoices() {
    return [];
  },
  async synthesize() {
    throw new Error('Web Speech 引擎不产生可缓存的音频数据');
  },
  speakDirect(
    text: string,
    opts: { rate: number; language: string },
    onEnd: () => void,
    onError: (message: string) => void,
  ): void {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate;
    u.lang =
      opts.language === 'Auto'
        ? 'zh-CN'
        : opts.language.toLowerCase() === 'chinese'
          ? 'zh-CN'
          : 'en-US';
    const voices = synth.getVoices();
    const v =
      voices.find((x) => /zh[-_]CN/i.test(x.lang)) ||
      voices.find((x) => /^zh/i.test(x.lang)) ||
      null;
    if (v) u.voice = v;
    u.onend = onEnd;
    u.onerror = (ev) => onError(String((ev as SpeechSynthesisErrorEvent).error || 'speech error'));
    synth.speak(u);
  },
  cancelDirect(): void {
    window.speechSynthesis.cancel();
  },
};
