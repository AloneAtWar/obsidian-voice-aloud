/** MediaSession 集成：桌面系统媒体键 + 移动端锁屏控制。不可用时静默降级。 */

export interface MediaActionHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  prev(): void;
  next(): void;
  seekBack(): void;
}

function session(): MediaSession | null {
  return 'mediaSession' in navigator ? navigator.mediaSession : null;
}

export function bindMediaSession(handlers: MediaActionHandlers): void {
  const s = session();
  if (!s) return;
  try {
    s.setActionHandler('play', handlers.play);
    s.setActionHandler('pause', handlers.pause);
    s.setActionHandler('stop', handlers.stop);
    s.setActionHandler('previoustrack', handlers.prev);
    s.setActionHandler('nexttrack', handlers.next);
    s.setActionHandler('seekbackward', handlers.seekBack);
  } catch {
    /* 部分动作在不支持的平台上注册会抛错，忽略即可 */
  }
}

export function updateMediaState(opts: {
  playing: boolean;
  title: string;
  sentence?: string;
}): void {
  const s = session();
  if (!s) return;
  try {
    s.metadata = new MediaMetadata({
      title: opts.sentence ? opts.sentence.slice(0, 60) : opts.title,
      artist: opts.title,
      album: 'Voice Aloud',
    });
    s.playbackState = opts.playing ? 'playing' : 'paused';
  } catch {
    /* ignore */
  }
}

export function updatePositionState(durationSec: number, positionSec: number, rate: number): void {
  const s = session();
  if (!s || !isFinite(durationSec) || durationSec <= 0) return;
  try {
    s.setPositionState({
      duration: durationSec,
      position: Math.min(Math.max(positionSec, 0), durationSec),
      playbackRate: rate > 0 ? rate : 1,
    });
  } catch {
    /* ignore */
  }
}

export function clearMediaSession(): void {
  const s = session();
  if (!s) return;
  try {
    s.metadata = null;
    s.playbackState = 'none';
  } catch {
    /* ignore */
  }
}
