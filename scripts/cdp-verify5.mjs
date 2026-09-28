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
async function ev(expression, ms = 20000) {
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
    await sleep(5000);
    await ev("app.commands.executeCommandById('voice-aloud:open-panel')");
    await sleep(1500);

    console.log('== 面板选择行 ==');
    console.log(
      JSON.stringify(
        await ev(`(() => ({
          accountOptions: Array.from(document.querySelectorAll('.va-player-select')).map(s => Array.from(s.options).map(o => o.text).slice(0, 6)),
          accountValue: document.querySelectorAll('.va-player-select')[0]?.value?.slice(0, 20),
          voiceVisible: !!document.querySelector('.va-player-voice-row select') && getComputedStyle(document.querySelector('.va-player-voice-row')).display !== 'none',
          subtitle: document.querySelector('.va-player-subtitle')?.textContent,
        }))()`),
        null,
        1,
      ),
    );

    // 用 Serena 播一句 → 写缓存（带归属）
    console.log('== 播一句（Serena）==');
    await ev("app.plugins.plugins['voice-aloud'].togglePointRead()");
    await sleep(2000);
    await ev(`(() => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 2)];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(6000);
    console.log(
      JSON.stringify(
        await ev(`app.plugins.plugins['voice-aloud'].storage.listByNote().then(rs => rs.map(r => ({ note: r.notePath.slice(-18), owner: r.owner.accountName + '·' + r.owner.voice, entries: r.entries })))`),
      ),
    );
    await ev("app.commands.executeCommandById('voice-aloud:stop')");

    // 面板切音色 Vivian → 再播一句 → 缓存出现第二个归属
    console.log('== 切音色 Vivian 再播 ==');
    await ev(`(() => {
      const sel = document.querySelector('.va-player-voice-row select');
      if (!sel) return 'no voice select';
      const opt = Array.from(sel.options).find(o => o.value === 'Vivian');
      if (!opt) return 'no Vivian option';
      sel.value = 'Vivian';
      sel.dispatchEvent(new Event('change'));
      return 'switched';
    })()`);
    await sleep(1500);
    console.log(
      'voice now:',
      await ev(`app.plugins.plugins['voice-aloud'].storage ? require === undefined ? '' : '' : ''`) ?? '',
    );
    console.log(
      JSON.stringify(await ev(`(() => {
        const p = app.plugins.plugins['voice-aloud'];
        return { activeVoice: p.settings.voiceByAccount['acct-qwen3-local'] };
      })()`)),
    );
    await ev(`(() => {
      const els = document.querySelectorAll('.va-sent[data-va]');
      const el = els[Math.floor(els.length / 2)];
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await sleep(6000);
    console.log(
      JSON.stringify(
        await ev(`app.plugins.plugins['voice-aloud'].storage.listByNote().then(rs => rs.map(r => ({ note: r.notePath.slice(-18), owner: r.owner.accountName + '·' + r.owner.voice, entries: r.entries })))`),
      ),
    );
    await ev("app.commands.executeCommandById('voice-aloud:stop')");
    await sleep(300);
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
