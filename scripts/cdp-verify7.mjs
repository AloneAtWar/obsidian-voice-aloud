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
async function ev(expression, ms = 30000) {
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

    console.log('== 准备第二账号 + 刷新面板 ==');
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
          p.refreshPlayerViews();
          return p.settings.accounts.map(a => a.name);
        })()`),
      ),
    );

    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1500);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2000);

    console.log('== BUG2: 点击换句立即停旧音频 ==');
    const r2 = await ev(`(async () => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 3)];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // 等第一句真正开播
      const p = app.plugins.plugins['voice-aloud'];
      for (let i = 0; i < 40 && !(p.player.audio && !p.player.audio.paused && p.player.audio.currentTime > 0.3); i++) {
        await new Promise(r => setTimeout(r, 150));
      }
      const before = p.player.audio
        ? { paused: p.player.audio.paused, t: Math.round(p.player.audio.currentTime * 10) / 10 }
        : 'no-audio';
      // 正在播时点另一句 → 120ms 内旧音频应已暂停
      const el2 = els[Math.min(els.length - 1, Math.floor(els.length / 3) + 3)];
      el2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      const rightAfter = p.player.audio
        ? { paused: p.player.audio.paused, t: Math.round(p.player.audio.currentTime * 10) / 10 }
        : 'no-audio';
      await new Promise(r => setTimeout(r, 5000));
      const after = p.player.audio
        ? { paused: p.player.audio.paused, t: Math.round(p.player.audio.currentTime * 10) / 10 }
        : 'no-audio';
      return { before, rightAfter, after, curIdx: p.player.getState().currentIdx, loading: p.player.getState().loading };
    })()`, 40000);
    console.log(JSON.stringify(r2, null, 1));

    console.log('== BUG1: 切账号 → 新账号合成 ==');
    const switchResult = await ev(`(async () => {
      const sel = document.querySelectorAll('.va-player-select')[0];
      const has = Array.from(sel.options).some(o => o.value === 'acct-qwen3-eric');
      if (!has) return { err: 'option missing', options: Array.from(sel.options).map(o => o.text) };
      sel.value = 'acct-qwen3-eric';
      sel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 1000));
      const p = app.plugins.plugins['voice-aloud'];
      return { activeId: p.settings.activeAccountId, subtitle: document.querySelector('.va-player-subtitle')?.textContent };
    })()`);
    console.log(JSON.stringify(switchResult));
    await ev(`(() => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 2) + 4];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(6000);
    console.log(
      JSON.stringify(
        await ev(`app.plugins.plugins['voice-aloud'].storage.listByNote().then(rs => rs.map(r => ({ owner: r.owner.accountName + '·' + r.owner.voice, entries: r.entries })))`),
      ),
    );
    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");

    console.log('== 设置页 ==');
    await ev(`(() => { app.setting.open(); })()`);
    await sleep(800);
    await ev(`(() => { app.setting.openTabById('voice-aloud'); })()`);
    await sleep(1500);
    console.log(
      JSON.stringify(
        await ev(`(() => {
          const tab = document.querySelector('.vertical-tab-content');
          return {
            headings: Array.from(tab?.querySelectorAll('.setting-item-heading') ?? []).map(h => h.textContent?.trim()),
            hasSlider: !!tab?.querySelector('input[type="range"]'),
            names: Array.from(tab?.querySelectorAll('.setting-item-name') ?? []).map(n => n.textContent?.trim()).slice(0, 8),
          };
        })()`),
        null,
        1,
      ),
    );
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync('D:/devlopment/obsidian-voice-aloud/scripts/settings-shot.png', Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved');
    await ev(`app.setting.close()`);

    // 清理测试账号
    await ev(`(() => {
      const p = app.plugins.plugins['voice-aloud'];
      p.settings.accounts = p.settings.accounts.filter(a => a.id !== 'acct-qwen3-eric');
      if (p.settings.activeAccountId === 'acct-qwen3-eric') p.settings.activeAccountId = 'acct-qwen3-local';
      p.saveSettings();
      p.refreshPlayerViews();
    })()`);

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
