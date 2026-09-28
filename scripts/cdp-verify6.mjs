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
async function ev(expression, ms = 25000) {
  return Promise.race([
    send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) =>
      r.exceptionDetails
        ? { err: String(r.exceptionDetails.exception?.description).slice(0, 400) }
        : r.result?.value,
    ),
    new Promise((r) => setTimeout(() => r({ err: 'evaluate-timeout' }), ms)),
  ]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
  } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push(d.params.args.map((a) => a.description ?? a.value).join('|').slice(0, 300));
  }
};
ws.onerror = () => {
  console.error('WS connect failed');
  process.exit(1);
};
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(5000);

    // 造第二个账号（同 qwen3 服务、不同音色 Eric）
    console.log('== 准备第二账号 ==');
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const p = app.plugins.plugins['voice-aloud'];
          if (!p.settings.accounts.find(a => a.name === 'Qwen3-Eric')) {
            p.settings.accounts.push({
              id: 'acct-qwen3-eric', name: 'Qwen3-Eric', providerId: 'qwen3-tts',
              baseUrl: 'http://127.0.0.1:8765', voice: 'Eric', language: 'Chinese',
            });
          }
          p.settings.activeAccountId = 'acct-qwen3-local';
          return p.settings.accounts.map(a => a.name);
        })()`),
      ),
    );

    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1200);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2000);

    // BUG2 复现：播一句（Serena）→ 立刻点另一句 → 100ms 内旧音频必须已暂停
    console.log('== BUG2: 点击换句立即停旧音频 ==');
    const clickResult = await ev(`(async () => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 3)];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 2500));
      const p = app.plugins.plugins['voice-aloud'];
      const a1 = { paused: p.player.audio?.paused, t1: p.player.audio?.currentTime };
      // 正在播时点另一句
      const el2 = els[Math.floor(els.length / 3) + 3];
      el2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      const a2 = { paused: p.player.audio?.paused, t2: p.player.audio?.currentTime };
      await new Promise(r => setTimeout(r, 5000));
      const a3 = { paused: p.player.audio?.paused, t3: p.player.audio?.currentTime };
      return { before: a1, rightAfterClick: a2, after: a3, curIdx: p.player.getState().currentIdx };
    })()`, 30000);
    console.log(JSON.stringify(clickResult, null, 1));

    // BUG1 复现：切到 Eric 账号 → 点句 → 缓存归属必须是 Qwen3-Eric
    console.log('== BUG1: 切账号后用新账号合成 ==');
    await ev(`(() => {
      const sel = document.querySelectorAll('.va-player-select')[0];
      sel.value = 'acct-qwen3-eric';
      sel.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1500);
    await ev(`(() => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 2) + 5];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(6000);
    console.log(
      JSON.stringify(
        await ev(`app.plugins.plugins['voice-aloud'].storage.listByNote().then(rs => rs.map(r => ({ owner: r.owner.accountName + '·' + r.owner.voice, entries: r.entries })))`),
      ),
    );
    console.log(
      'activeId:',
      await ev(`app.plugins.plugins['voice-aloud'].settings.activeAccountId`),
    );
    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");

    // 设置页验证 + 截图
    console.log('== 设置页 ==');
    await ev(`(() => { app.setting.open(); app.setting.openTabById('voice-aloud'); })()`);
    await sleep(1500);
    console.log(
      JSON.stringify(
        await ev(`(() => ({
          headings: Array.from(document.querySelectorAll('.settings-active .setting-item-heading')).map(h => h.textContent),
          hasSlider: !!document.querySelector('.settings-active input[type="range"]'),
          hasRate: Array.from(document.querySelectorAll('.settings-active .setting-item-name')).some(n => n.textContent?.includes('语速')),
          accountRows: Array.from(document.querySelectorAll('.settings-active .setting-item-name')).map(n => n.textContent?.slice(0, 20)).slice(0, 8),
        }))()`),
        null,
        1,
      ),
    );
    const rect = await ev(`(() => {
      const el = document.querySelector('.settings-active vertical-tab-content') ?? document.querySelector('.settings-active .vertical-tab-content');
      const r = (el ?? document.querySelector('.settings-active')).getBoundingClientRect();
      return { x: Math.max(0, r.x), y: r.y, width: r.width, height: Math.min(r.height, 800), scale: 1 };
    })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: rect, captureBeyondViewport: false });
    const { writeFileSync } = await import('node:fs');
    writeFileSync('D:/devlopment/obsidian-voice-aloud/scripts/settings-shot.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved');
    await ev(`app.setting.close()`);

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
