// 聚焦笔记 → 点读 → 点击句子 → 读 Notice 与错误堆栈
const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let id = 0;
const pending = new Map();
const events = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? { err: String(r.exceptionDetails.exception?.description) } : r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    const text = d.params.args.map((a) => a.description ?? a.value).join('|');
    if (text.includes('voice-aloud')) events.push(text);
  }
};

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    console.log('plugin loaded:', JSON.stringify(await ev(`!!app.plugins.plugins['voice-aloud']`)));

    // 聚焦 markdown 笔记页
    console.log('focus:', JSON.stringify(await ev(`(() => {
      const leaf = app.workspace.getLeavesOfType('markdown')[0];
      if (!leaf) return 'no markdown leaf';
      app.workspace.setActiveLeaf(leaf, true);
      return 'focused';
    })()`)));
    await sleep(1200);

    await ev(`app.commands.executeCommandById('voice-aloud:point-read')`);
    await sleep(2000);
    console.log('point-read:', JSON.stringify(await ev(`document.body.classList.contains('va-point-read')`)));

    console.log('click:', JSON.stringify(await ev(`(() => {
      const el = document.querySelector('.va-sent[data-va]');
      if (!el) return 'no span';
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return el.textContent.slice(0, 20);
    })()`)));
    await sleep(9000);

    console.log('after:', JSON.stringify(await ev(`(() => ({
      notices: Array.from(document.querySelectorAll('.notice')).map(n => n.textContent.slice(0, 120)),
      active: document.querySelectorAll('.va-sent.va-active').length,
      audioCount: document.querySelectorAll('audio').length,
      toolbar: document.querySelector('.va-toolbar')?.textContent?.slice(0, 24),
    }))()`)));

    await ev(`app.commands.executeCommandById('voice-aloud:stop')`);
    await sleep(400);
    await ev(`app.commands.executeCommandById('voice-aloud:point-read')`);

    console.log('== voice-aloud 错误 ==');
    for (const e of events) console.log('---\n' + e);
    if (!events.length) console.log('（无）');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
