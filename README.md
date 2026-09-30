# Voice Aloud

逐句朗读 Obsidian 笔记的 TTS 插件：**点击正文任意句子，从该句开始整篇连读**，当前句高亮跟随，预取 + 哈希缓存实现无缝衔接。桌面与移动端（锁屏续播）可用。

## 功能

- **点读模式**：一个命令/按钮进入——自动切到阅读视图并启用「点击句子开始朗读」；切回编辑模式、关闭笔记或再次点击即退出，平时阅读视图零感知
- **Player 面板**：播放/暂停/停止、上一句/下一句、回退 N 秒（可配置）、倍速 0.75x–3x、当前句展示（点击定位正文）、整篇预生成 + 进度
- **多供应商账号体系**：供应商（系统适配器）与账号（你的实例配置）分离，可同时配置多个账号随时切换
  - OpenAI 兼容端点（`POST /v1/audio/speech`，支持自托管服务）
  - Qwen3-TTS 专属适配器（`/v1/audio/speech` + `/api/voices` 音色发现 + `/health` 健康检查 + 语言参数）
  - Xiaomi MiMo TTS（chat-completions 形态，支持风格指令）
  - 系统 Web Speech（内置离线保底，无需配置）
- **句子级哈希缓存**（IndexedDB）：缓存键包含账号/供应商/模型/音色/语言/句子文本，改句只重合成该句；设置页按笔记查看与清理缓存
- **正文高亮跟随**：TTS 断句与正文标注共用同一套切分逻辑，点击、缓存失效、编辑后续播精确对齐

## 安装

### 从 GitHub Releases

1. 从 [Releases](https://github.com/AloneAtWar/obsidian-voice-aloud/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 放入 vault 的 `.obsidian/plugins/voice-aloud/` 目录
3. 重启 Obsidian 并启用插件

### 通过 BRAT

添加本仓库地址到 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 即可安装并跟踪测试版。

## English

Voice Aloud is a text-to-speech plugin that reads your notes aloud sentence by sentence. Click any sentence in reading view to start continuous playback from that point, with the current sentence highlighted as it reads. Playback is gapless thanks to prefetching and a per-sentence hash cache.

- **Point-read mode**: one command toggles click-to-read in reading view; switch back to editing or close the note to exit instantly.
- **Player panel**: play/pause/stop, previous/next sentence, configurable seek-back, speed 0.75x–3x, current-sentence display, and full-note pregeneration with progress.
- **Multiple TTS providers and accounts**: OpenAI-compatible endpoints (including self-hosted), a dedicated Qwen3-TTS adapter, Xiaomi MiMo TTS, and the built-in system voice as an offline fallback.
- **Sentence-level cache** (IndexedDB): cache keys cover account, provider, model, voice, language and text, so edited sentences are re-synthesized only.
- Works on desktop and mobile, with lock-screen controls via Media Session.

Install: download `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/AloneAtWar/obsidian-voice-aloud/releases) into `.obsidian/plugins/voice-aloud/`, or add this repository to [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## 开发

```bash
npm install
npm run dev        # watch 模式构建
npm run build      # 生产构建（minify）
npm run lint       # ESLint
npm run typecheck  # TypeScript 严格类型检查
npm test           # Vitest 单元测试
```

### 架构

```
src/
├── main.ts              # 插件入口：命令、事件接线
├── i18n/                # 文案集中管理（中文，预留多语言）
├── core/
│   ├── sentences.ts     # 断句 + 句子身份（hash），TTS 与正文标注共用
│   ├── annotation.ts    # 阅读视图句子 span 标注 + 播放高亮
│   ├── point-read.ts    # 点读模式状态机
│   ├── player.ts        # 播放状态机（预取、回退 N 秒、预生成）
│   ├── mediasession.ts  # 系统媒体键 / 锁屏控制
│   ├── accounts.ts      # 账号模型与当前账号解析
│   ├── providers/       # TTS 供应商适配器（统一接口 + 注册表）
│   └── cache/           # IndexedDB 音频缓存 + 笔记反向索引
├── ui/                  # Player 面板、设置页、账号编辑弹窗
└── util/                # 哈希等工具
```

## License

[MIT](./LICENSE)
