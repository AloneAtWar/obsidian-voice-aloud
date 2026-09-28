// 构建并部署到 vault 插件目录（不覆盖 data.json 用户配置）
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const VAULT_PLUGIN_DIR = 'D:/knowledgeBase/.obsidian/plugins/voice-aloud';

execFileSync(process.execPath, ['esbuild.config.mjs', 'production'], { stdio: 'inherit' });
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
  copyFileSync(f, join(VAULT_PLUGIN_DIR, f));
  console.log(`已复制 ${f} -> ${join(VAULT_PLUGIN_DIR, f)}`);
}
console.log('完成。重启 Obsidian（或重载插件）后生效。');
