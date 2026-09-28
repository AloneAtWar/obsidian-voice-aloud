// CDP 端到端验证：点读模式 → 句子标注 → 点击播放 → 停止，全程捕获新异常
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
  if (r.exceptionDetails) {
    return { __error: String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) };
  }
  return r.result?.value;
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

    console.log('== 初始状态 ==');
    console.log(JSON.stringify(await evaluate(`(() => ({
      loaded: !!app.plugins.plugins['voice-aloud'],
      vaRoot: document.querySelectorAll('.va-root').length,
      previewMode: !!document.querySelector('.markdown-preview-view'),
    }))()`)));

    console.log('== TTS 服务健康 ==');
    console.log(JSON.stringify(await evaluate(`fetch('http://127.0.0.1:8765/health').then(r => r.json()).catch(e => ({error: String(e)}))`)));

    console.log('== 进入点读模式 ==');
    await evaluate(`app.commands.executeCommandById('voice-aloud:point-read')`);
    await sleep(2000);
    console.log(JSON.stringify(await evaluate(`(() => ({
      bodyPointRead: document.body.classList.contains('va-point-read'),
      vaSent: document.querySelectorAll('.va-sent').length,
      firstSent: document.querySelector('.va-sent')?.textContent?.slice(0, 30) ?? null,
    }))()`)));

    console.log('== 点击第 5 个句子（模拟真实点击）==');
    const clicked = await evaluate(`(() => {
      const spans = document.querySelectorAll('.va-sent[data-va]');
      const el = spans[4] ?? spans[0];
      if (!el) return { ok: false, reason: 'no span' };
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { ok: true, text: el.textContent.slice(0, 30), id: el.dataset.va.slice(0, 12) };
    })()`);
    console.log(JSON.stringify(clicked));
    await sleep(6000);
    console.log(JSON.stringify(await evaluate(`(() => ({
      active: document.querySelectorAll('.va-sent.va-active').length,
      activeText: document.querySelector('.va-sent.va-active')?.textContent?.slice(0, 30) ?? null,
      audioPlaying: Array.from(document.querySelectorAll('audio')).some(a => !a.paused),
      toolbar: document.querySelector('.va-toolbar')?.textContent?.slice(0, 40),
    }))()`)));

    console.log('== 停止 + 退出点读 ==');
    await evaluate(`app.commands.executeCommandById('voice-aloud:stop')`);
    await sleep(500);
    await evaluate(`app.commands.executeCommandById('voice-aloud:point-read')`);
    await sleep(1000);
    console.log(JSON.stringify(await evaluate(`(() => ({
      bodyPointRead: document.body.classList.contains('va-point-read'),
      active: document.querySelectorAll('.va-sent.va-active').length,
    }))()`)));

    console.log('== 本轮新捕获异常 ==');
    let n = 0;
    for (const e of events) {
      if (e.method === 'Runtime.exceptionThrown') {
        n++;
        console.log('[exception]', e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
      } else if (e.params.type === 'error') {
        n++;
        console.log('[console.error]', JSON.stringify(e.params.args?.map((a) => a.value ?? a.description)));
      }
    }
    if (!n) console.log('（无）✅');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('verify failed:', e);
    process.exit(1);
  }
};
