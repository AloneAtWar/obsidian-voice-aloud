const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails
    ? { err: String(r.exceptionDetails.exception?.description).slice(0, 500) }
    : r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
  }
};
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(4000);
    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1200);
    // 播放让截图有活状态
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(1800);
    await ev(`(() => {
      const el = document.querySelector('.va-sent[data-va]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(5000);
    // 元素级截图：直接裁 .va-player 的 boundingRect
    const rect = await ev(`(() => {
      const el = document.querySelector('.va-player');
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height + 16, window.innerHeight - r.y), scale: 1 };
    })()`);
    console.log('rect:', JSON.stringify(rect));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: rect,
      captureBeyondViewport: false,
    });
    const { writeFileSync } = await import('node:fs');
    writeFileSync('D:/devlopment/obsidian-voice-aloud/scripts/panel-only.png', Buffer.from(shot.data, 'base64'));
    console.log('saved panel-only.png');
    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
