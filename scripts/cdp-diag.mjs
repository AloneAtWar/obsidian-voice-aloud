// CDP 诊断：连上 Obsidian 渲染进程，重载 voice-aloud 插件，捕获异常与控制台错误
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
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    return { __error: r.exceptionDetails };
  }
  return r.result?.value;
}

ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
  } else if (d.method) {
    if (
      d.method === 'Runtime.exceptionThrown' ||
      d.method === 'Log.entryAdded' ||
      d.method === 'Runtime.consoleAPICalled'
    ) {
      events.push(d);
    }
  }
};

ws.onerror = (e) => {
  console.error('WS error', e.message ?? e);
  process.exit(1);
};

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Log.enable');

    console.log('== 插件状态 ==');
    console.log(
      JSON.stringify(
        await evaluate(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          return {
            loaded: !!p,
            version: p?.manifest?.version,
            panelLeaves: app.workspace.getLeavesOfType('voice-aloud-view').length,
            vaRoot: document.querySelectorAll('.va-root').length,
            vaBtn: document.querySelectorAll('.va-btn').length,
            vaSent: document.querySelectorAll('.va-sent').length,
            bodyPointRead: document.body.classList.contains('va-point-read'),
          };
        })()`),
        null,
        2,
      ),
    );

    console.log('== 重载插件以捕获异常 ==');
    await evaluate(`app.plugins.disablePlugin('voice-aloud').then(() => app.plugins.enablePlugin('voice-aloud'))`);
    await new Promise((r) => setTimeout(r, 2500));

    console.log('== 打开面板 ==');
    await evaluate(`app.commands.executeCommandById('voice-aloud:open-panel')`);
    await new Promise((r) => setTimeout(r, 1500));

    console.log(
      JSON.stringify(
        await evaluate(`(() => ({
          vaRoot: document.querySelectorAll('.va-root').length,
          vaRootChildren: document.querySelector('.va-root')?.childElementCount ?? -1,
          vaBtn: document.querySelectorAll('.va-btn').length,
          toolbarText: document.querySelector('.va-toolbar')?.textContent?.slice(0, 80) ?? null,
        }))()`),
        null,
        2,
      ),
    );

    console.log('== 捕获到的异常/错误 ==');
    for (const e of events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        console.log('[exception]', d.text, d.exception?.description ?? '');
      } else if (e.method === 'Log.entryAdded') {
        const en = e.params.entry;
        if (en.level === 'error') console.log('[log.error]', en.text, en.url ?? '');
      } else if (e.method === 'Runtime.consoleAPICalled') {
        if (e.params.type === 'error') {
          console.log('[console.error]', JSON.stringify(e.params.args?.map((a) => a.value ?? a.description ?? a.type)));
        }
      }
    }
    if (!events.length) console.log('(无)');

    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('diag failed:', e);
    process.exit(1);
  }
};
