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
    ? { err: String(r.exceptionDetails.exception?.description).slice(0, 400) }
    : r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 单条 evaluate 带超时，避免整体卡死
async function evt(expression, ms = 15000) {
  return Promise.race([
    ev(expression),
    sleep(ms).then(() => ({ err: 'evaluate-timeout' })),
  ]);
}
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push(d.params.args.map((a) => a.description ?? a.value).join('|').slice(0, 400));
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
    await evt("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1000);

    // 1. 跟读模式：命令切换后面板按钮同步
    console.log('== follow-read 命令同步 ==');
    await evt("app.commands.executeCommandById('voice-aloud:follow-read')");
    await sleep(500);
    console.log(
      JSON.stringify(
        await evt(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          const btns = Array.from(document.querySelectorAll('.va-player-toggle'));
          const follow = btns.find(b => b.ariaLabel?.includes('跟读'));
          return { setting: p.settings.followRead, btnActive: follow?.classList.contains('is-active') };
        })()`),
      ),
    );
    await evt("app.commands.executeCommandById('voice-aloud:follow-read')");
    await sleep(500);
    console.log(
      JSON.stringify(
        await evt(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          const btns = Array.from(document.querySelectorAll('.va-player-toggle'));
          const follow = btns.find(b => b.ariaLabel?.includes('跟读'));
          return { setting: p.settings.followRead, btnActive: follow?.classList.contains('is-active') };
        })()`),
      ),
    );

    // 2. 转圈：直接播最后一句（大概率未缓存），立即高频轮询
    console.log('== spinner ==');
    const spin = await evt(
      `(async () => {
        const p = app.plugins.plugins['voice-aloud'];
        const total = p.player.getUnits().length;
        p.player.playFromIndex(total - 1);
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 60));
          const el = document.querySelector('.va-player-play.is-spinning');
          if (el) {
            const s = p.player.getState();
            await new Promise(r => setTimeout(r, 400));
            return { seen: true, svgClass: el.querySelector('svg')?.getAttribute('class')?.slice(0, 40) };
          }
        }
        return { seen: false };
      })()`,
      30000,
    );
    console.log(JSON.stringify(spin));
    await evt("app.commands.executeCommandById('voice-aloud:stop')");

    // 3. 预生成按钮：启动→百分比→再点停止→恢复图标
    console.log('== pregen ==');
    await evt(`app.plugins.plugins['voice-aloud'].player.pregenerateAll()`, 8000);
    await sleep(2500);
    console.log(
      JSON.stringify(
        await evt(`(() => {
          const b = document.querySelector('.va-player-pregen');
          return { text: b?.textContent.slice(0, 8), isActive: b?.classList.contains('is-active'), status: document.querySelector('.va-player-status')?.textContent?.slice(0, 26) };
        })()`),
      ),
    );
    await evt(`app.plugins.plugins['voice-aloud'].player.pregenerateAll()`, 8000);
    await sleep(600);
    console.log(
      JSON.stringify(
        await evt(`(() => {
          const b = document.querySelector('.va-player-pregen');
          return { afterStopText: b?.textContent.slice(0, 8), hasWaveIcon: !!b?.querySelector('svg'), statusHidden: document.querySelector('.va-player-status')?.classList.contains('is-hidden') };
        })()`),
      ),
    );

    console.log('== errors ==');
    for (const e of errors) console.log('--- ' + e);
    if (!errors.length) console.log('(none)');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error('failed:', e);
    process.exit(1);
  }
};
