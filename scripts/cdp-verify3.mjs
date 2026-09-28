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
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push(d.params.args.map((a) => a.description ?? a.value).join('|').slice(0, 400));
  }
};
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(5000);
    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1200);

    console.log('== 面板结构 ==');
    console.log(
      JSON.stringify(
        await ev(`(() => ({
          secondaryBtns: Array.from(document.querySelectorAll('.va-player-secondary button, .va-player-pregen')).map(b => ({
            cls: b.className.split(' ').filter(c => c.startsWith('va-')).join(' '),
            hasSvg: !!b.querySelector('svg'),
            text: b.textContent.slice(0, 6),
          })),
          followActive: document.querySelector('.va-player-toggle:nth-of-type(1)')?.className.includes('is-active'),
        }))()`),
        null,
        1,
      ),
    );

    // 跟读模式：图标是否存在 + 切换
    console.log('== 跟读模式 ==');
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const btns = Array.from(document.querySelectorAll('.va-player-toggle'));
          const follow = btns.find(b => b.ariaLabel?.includes('跟读'));
          return { found: !!follow, hasSvg: !!follow?.querySelector('svg'), active: follow?.classList.contains('is-active') };
        })()`),
      ),
    );
    await ev("app.commands.executeCommandById('voice-aloud:follow-read')");
    await sleep(600);
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          const btns = Array.from(document.querySelectorAll('.va-player-toggle'));
          const follow = btns.find(b => b.ariaLabel?.includes('跟读'));
          return { settingNow: p.settings.followRead, btnActive: follow?.classList.contains('is-active') };
        })()`),
      ),
    );
    // 切回默认开
    await ev("app.commands.executeCommandById('voice-aloud:follow-read')");
    await sleep(400);

    // 合成中转圈：点一句未缓存的句子，立即轮询 is-spinning
    console.log('== 合成中转圈 ==');
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2000);
    const spin = await ev(`(async () => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[els.length - 1] ?? els[0];
      if (!el) return 'no span';
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (document.querySelector('.va-player-play.is-spinning')) return 'spinner-seen';
      }
      return 'spinner-not-seen';
    })()`);
    console.log(JSON.stringify(spin));

    // 预生成：启动后检查按钮百分比，再点停止
    console.log('== 预生成百分比 ==');
    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(500);
    await ev(`app.plugins.plugins['voice-aloud'].player.pregenerateAll()`);
    await sleep(2500);
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const b = document.querySelector('.va-player-pregen');
          return { text: b?.textContent.slice(0, 6), active: b?.classList.contains('is-active'), status: document.querySelector('.va-player-status')?.textContent?.slice(0, 24) };
        })()`),
      ),
    );
    // 再点一次（停止）
    await ev(`app.plugins.plugins['voice-aloud'].player.pregenerateAll()`);
    await sleep(800);
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const b = document.querySelector('.va-player-pregen');
          return { afterStop: b?.textContent.slice(0, 6), hasSvg: !!b?.querySelector('svg'), statusHidden: document.querySelector('.va-player-status')?.classList.contains('is-hidden') };
        })()`),
      ),
    );
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");

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
