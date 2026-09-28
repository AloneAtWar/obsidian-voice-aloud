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
    ? { err: String(r.exceptionDetails.exception?.description).slice(0, 900) }
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
    errors.push(d.params.args.map((a) => a.description ?? a.value).join('|').slice(0, 800));
  }
};
ws.onerror = () => {
  console.error('WS connect failed');
  process.exit(1);
};
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await sleep(5000);

    console.log('== debugSynthesize 直接测合成 ==');
    console.log(JSON.stringify(await ev("app.plugins.plugins['voice-aloud'].debugSynthesize('你好，这是诊断句。')"), null, 1));

    console.log('== 完整播放链路 ==');
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2500);
    await ev(`(() => {
      const el = document.querySelector('.va-sent[data-va]');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(12000);
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          const a = p.player.audio;
          return {
            state: p.player.getState(),
            audioSrc: a ? a.src.slice(0, 40) : null,
            audioPaused: a ? a.paused : null,
            audioTime: a ? Math.round(a.currentTime * 10) / 10 : null,
            audioDur: a ? Math.round(a.duration * 10) / 10 : null,
            notices: Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent.slice(0, 180)),
            toolbar: document.querySelector('.va-toolbar')?.textContent?.slice(0, 26),
          };
        })()`),
        null,
        1,
      ),
    );

    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    console.log('== 新错误 ==');
    for (const e of errors) console.log('--- ' + e);
    if (!errors.length) console.log('(none)');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
