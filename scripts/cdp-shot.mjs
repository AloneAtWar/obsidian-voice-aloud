const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let id = 0;
const pending = new Map();
const errors = [];
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
    ? { err: String(r.exceptionDetails.exception?.description).slice(0, 600) }
    : r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push(d.params.args.map((a) => a.description ?? a.value).join('|').slice(0, 500));
  }
};
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(5000);

    // 打开面板
    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1500);
    console.log(
      'panel:',
      JSON.stringify(
        await ev(`(() => ({
          player: document.querySelectorAll('.va-player').length,
          header: document.querySelector('.va-player-title')?.textContent ?? null,
          subtitle: document.querySelector('.va-player-subtitle')?.textContent ?? null,
          buttons: document.querySelectorAll('.va-player-btn').length,
          playBtn: !!document.querySelector('.va-player-play'),
          scrubber: !!document.querySelector('.va-player-scrubber'),
          nowText: document.querySelector('.va-player-now-text')?.textContent?.slice(0, 24) ?? null,
          status: document.querySelector('.va-player-status')?.textContent ?? null,
        }))()`),
      ),
    );

    // 播放一句，让截图带上活状态
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2000);
    await ev(`(() => {
      const el = document.querySelector('.va-sent[data-va]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(7000);
    console.log(
      'live:',
      JSON.stringify(
        await ev(`(() => ({
          playing: app.plugins.plugins['voice-aloud'].player.getState().playing,
          nowLabel: document.querySelector('.va-player-now-label')?.textContent ?? null,
          nowText: document.querySelector('.va-player-now-text.is-live')?.textContent?.slice(0, 24) ?? null,
          scrubberMax: document.querySelector('.va-player-scrubber')?.max,
          loadingActive: !!document.querySelector('.va-player-loading.is-active'),
        }))()`),
      ),
    );

    // 截图（整个窗口）
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync('D:/devlopment/obsidian-voice-aloud/scripts/panel-screenshot.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved');

    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    console.log('errors:');
    for (const e of errors) console.log('--- ' + e);
    if (!errors.length) console.log('(none)');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
