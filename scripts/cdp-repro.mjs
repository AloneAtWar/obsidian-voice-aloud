// 复现合成失败并抓取完整错误堆栈
const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let msgId = 0;
const pending = new Map();
const events = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails
    ? { __error: String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) }
    : r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
  } else if (d.method === 'Runtime.exceptionThrown' || d.method === 'Runtime.consoleAPICalled') {
    events.push(d);
  }
};

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Log.enable');

    // 直接探测 TTS 服务的 CORS 响应头（renderer 视角）
    console.log('== 服务探测（no-cors 模式可达性） ==');
    console.log(
      JSON.stringify(
        await evaluate(`fetch('http://127.0.0.1:8765/health', {mode:'no-cors'}).then(r => ({type: r.type, status: r.status})).catch(e => ({error: String(e)}))`),
      ),
    );

    console.log('== 复现：点读 + 点击句子 ==');
    await evaluate(`app.commands.executeCommandById('voice-aloud:point-read')`);
    await sleep(1500);
    const click = await evaluate(`(() => {
      const el = document.querySelector('.va-sent[data-va]');
      if (!el) return { ok: false };
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { ok: true, text: el.textContent.slice(0, 24) };
    })()`);
    console.log(JSON.stringify(click));
    await sleep(8000);

    console.log('== 播放后状态 ==');
    console.log(
      JSON.stringify(
        await evaluate(`(() => ({
          active: document.querySelectorAll('.va-sent.va-active').length,
          audio: Array.from(document.querySelectorAll('audio')).map(a => ({paused: a.paused, src: (a.src||'').slice(0,30), err: a.error?.code})),
          toolbar: document.querySelector('.va-toolbar')?.textContent?.slice(0, 30),
        }))()`),
      ),
    );

    await evaluate(`app.commands.executeCommandById('voice-aloud:stop')`);
    await sleep(400);
    await evaluate(`app.commands.executeCommandById('voice-aloud:point-read')`);

    console.log('== 新捕获事件（含完整堆栈） ==');
    for (const e of events.slice(-6)) {
      if (e.method === 'Runtime.exceptionThrown') {
        console.log('[exception]', e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
      } else if (e.params.type === 'error') {
        console.log(
          '[console.error]',
          e.params.args.map((a) => a.description ?? a.value).join('\n'),
        );
      }
    }
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('repro failed:', e);
    process.exit(1);
  }
};
