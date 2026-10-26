// 构建并部署到 vault 插件目录（不覆盖 data.json 用户配置）
//
// 用法：
//   node deploy.mjs <vault>/.obsidian/plugins/voice-aloud
//   VOICE_ALOUD_PLUGIN_DIR=<vault>/.obsidian/plugins/voice-aloud node deploy.mjs
//
// 仓库里不保存任何本机路径。想省掉每次输路径，可在本地建 deploy.local.mjs
// （已在 .gitignore 中）写死自己的目录，再 `node deploy.local.mjs`。
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const VAULT_PLUGIN_DIR = (process.env.VOICE_ALOUD_PLUGIN_DIR ?? process.argv[2] ?? '').trim();
if (!VAULT_PLUGIN_DIR) {
  console.error(
    '未指定插件目录。用法：node deploy.mjs <vault>/.obsidian/plugins/voice-aloud\n' +
      '或设置环境变量 VOICE_ALOUD_PLUGIN_DIR。',
  );
  process.exit(1);
}

execFileSync(process.execPath, ['esbuild.config.mjs', 'production'], { stdio: 'inherit' });
for (const f of ['main.js', 'manifest.json', 'styles.css', 'azure-voices.json']) {
  copyFileSync(f, join(VAULT_PLUGIN_DIR, f));
  console.log(`已复制 ${f} -> ${join(VAULT_PLUGIN_DIR, f)}`);
}
console.log('完成。重启 Obsidian（或重载插件）后生效。');
