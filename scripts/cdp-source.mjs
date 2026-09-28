// 从 Obsidian 渲染进程读取 app.js 出错偏移附近的源码片段
const WS_URL = process.argv[2];
const offsets = process.argv.slice(3).map(Number);

const ws = new WebSocket(WS_URL);
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
  }
};

ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    const src = await send('Runtime.evaluate', {
      expression: `fetch('app.js').then(r => r.text())`,
      awaitPromise: true,
      returnByValue: true,
    }).then((r) => r.result.value);
    console.log('app.js length:', src.length);
    for (const off of offsets) {
      console.log(`\n===== offset ${off} =====`);
      console.log(src.slice(Math.max(0, off - 350), off + 250));
    }
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
