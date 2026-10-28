#!/usr/bin/env node
/**
 * 发布就绪检查（Obsidian 社区商店 + BRAT 的硬性要求）。
 *
 * 用法：
 *   node scripts/verify-release.mjs            # 本地检查 + 远端 release 核对
 *   node scripts/verify-release.mjs --offline  # 只做本地检查（无网络时）
 *
 * 背景（BRAT-DEVELOPER-GUIDE）：
 * - Obsidian / BRAT 都按「仓库根 manifest.json 的 version」去找同名 release，
 *   再下载该 release 资产里的 manifest.json、main.js、styles.css 安装；
 * - release tag、release 名、release 内 manifest.json 的 version 三者必须一致；
 * - BRAT 取「按 semver 最新的 release（含 prerelease）」，因此修复要送达用户必须升版本号。
 *
 * 退出码：有 error → 1；只有 warning → 0。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = process.env.VERIFY_REPO ?? 'jemy204/obsidian-voice-aloud';
const OFFLINE = process.argv.includes('--offline');
const REQUIRED_ASSETS = ['manifest.json', 'main.js', 'styles.css'];

const results = [];
const record = (level, name, detail = '') => {
  results.push({ level, name, detail });
  const icon = level === 'error' ? '✗' : level === 'warn' ? '!' : '✓';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function checkManifest() {
  const m = readJson('manifest.json');
  const required = ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly'];
  const missing = required.filter((k) => m[k] === undefined);
  if (missing.length) return record('error', 'manifest.json 字段完整', `缺少 ${missing.join(', ')}`);
  if (!semver.test(m.version)) return record('error', 'manifest.version 是合法 semver', m.version);
  if (!semver.test(m.minAppVersion)) {
    return record('error', 'manifest.minAppVersion 是合法 semver', m.minAppVersion);
  }
  if (m.id !== 'voice-aloud') {
    record('warn', 'manifest.id 与插件目录名一致', `id=${m.id}，部署目录应为同名文件夹`);
  }
  record('info', 'manifest.json 字段完整', `v${m.version} · minApp ${m.minAppVersion}`);
  return m;
}

function checkVersions(manifest) {
  const versions = readJson('versions.json');
  if (versions[manifest.version] !== manifest.minAppVersion) {
    return record(
      'error',
      'versions.json 覆盖当前版本',
      `期望 "${manifest.version}": "${manifest.minAppVersion}"，实际 ${JSON.stringify(
        versions[manifest.version],
      )}`,
    );
  }
  const bad = Object.keys(versions).filter((v) => !semver.test(v));
  if (bad.length) record('warn', 'versions.json 版本号格式', `非 semver：${bad.join(', ')}`);
  record('info', 'versions.json 覆盖当前版本', `${Object.keys(versions).length} 条记录`);
}

function checkPackageVersion(manifest) {
  const pkg = readJson('package.json');
  if (pkg.version !== manifest.version) {
    return record(
      'error',
      'package.json 与 manifest 版本一致',
      `${pkg.version} ≠ ${manifest.version}`,
    );
  }
  record('info', 'package.json 与 manifest 版本一致', pkg.version);
}

function newestMtime(dir) {
  let newest = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    newest = Math.max(newest, st.isDirectory() ? newestMtime(p) : st.mtimeMs);
  }
  return newest;
}

function checkBuild() {
  if (!existsSync('main.js')) return record('error', 'main.js 已构建', '先跑 npm run build');
  const built = statSync('main.js').mtimeMs;
  const newestSrc = Math.max(newestMtime('src'), statSync('package.json').mtimeMs);
  if (built < newestSrc) {
    record('warn', 'main.js 比源码新', '产物可能过期，发布前重新 npm run build');
  } else {
    record('info', 'main.js 比源码新', `${(statSync('main.js').size / 1024).toFixed(0)} KB`);
  }
  if (!existsSync('styles.css')) record('warn', 'styles.css 存在', '缺失时 release 会少一个资产');
}

function checkCatalog() {
  if (!existsSync('azure-voices.json')) return record('info', 'azure-voices.json', '未提供（可选）');
  const cat = readJson('azure-voices.json');
  const voices = Array.isArray(cat) ? cat : (cat.voices ?? []);
  const ids = voices.map((v) => (typeof v === 'string' ? v : v?.id)).filter(Boolean);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) record('warn', '音色清单无重复 ID', dup.join(', '));
  const bad = ids.filter((id) => !/^[a-z]{2,3}-[A-Za-z]{2,4}[-:].+/.test(id));
  if (bad.length) record('warn', '音色 ID 形如 Azure ShortName', bad.slice(0, 3).join(', '));
  record('info', '音色清单可用', `${ids.length} 个音色`);
}

function checkNoSecrets() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  const leaked = tracked.filter((f) => /(^|\/)data\.json$/.test(f));
  if (leaked.length) {
    return record('error', '仓库未跟踪 data.json', `${leaked.join(', ')} 可能含 API Key`);
  }
  record('info', '仓库未跟踪 data.json', '用户配置不入库');
}

function checkWorkflow() {
  const file = '.github/workflows/release.yml';
  if (!existsSync(file)) return record('error', 'release workflow 存在', file);
  const src = readFileSync(file, 'utf8');
  const missing = REQUIRED_ASSETS.filter((a) => !src.includes(a));
  if (missing.length) {
    return record('error', 'release 上传三个资产', `workflow 未提及 ${missing.join(', ')}`);
  }
  record('info', 'release 上传三个资产', REQUIRED_ASSETS.join(' / '));
}

async function checkRemote(manifest) {
  if (OFFLINE) return record('info', '远端 release 核对', '已跳过（--offline）');
  const headers = { 'User-Agent': 'voice-aloud-verify' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let releases;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    releases = await res.json();
  } catch (e) {
    return record('warn', '远端 release 核对', `无法访问 GitHub API：${e.message}`);
  }
  if (!releases.length) return record('warn', '远端 release 存在', `${REPO} 还没有 release`);

  // BRAT：按 semver 取最新（含 prerelease）
  const parse = (t) => t.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const latest = releases
    .filter((r) => !r.draft)
    .sort((a, b) => {
      const [a1, a2, a3] = parse(a.tag_name);
      const [b1, b2, b3] = parse(b.tag_name);
      return b1 - a1 || b2 - a2 || b3 - a3;
    })[0];
  const tag = latest.tag_name.replace(/^v/, '');
  const assets = latest.assets.map((a) => a.name);
  const missing = REQUIRED_ASSETS.filter((a) => !assets.includes(a));
  if (missing.length) {
    record('error', `release ${tag} 资产齐全`, `缺少 ${missing.join(', ')}`);
  } else {
    record('info', `release ${tag} 资产齐全`, assets.join(' / '));
  }

  if (tag !== manifest.version) {
    record(
      'warn',
      '已发布版本 == 当前代码版本',
      `最新 release 是 ${tag}，仓库里是 ${manifest.version} —— 修复要送达 BRAT/商店用户需升版本号并重新打 tag`,
    );
  } else {
    const localHash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
    const digestOf = (name) =>
      (latest.assets.find((a) => a.name === name)?.digest ?? '').replace(/^sha256:/, '');

    const remoteMain = digestOf('main.js');
    if (remoteMain && remoteMain !== localHash('main.js')) {
      record('warn', `release ${tag} 的 main.js 与本地构建一致`, '哈希不同：release 里不是当前代码');
    } else {
      record('info', `release ${tag} 的 main.js 与本地构建一致`, remoteMain ? '哈希一致' : '无 digest，跳过');
    }

    // Obsidian 硬性要求：release tag / release 名 / release 内 manifest.json 的 version 三者一致
    const remoteManifest = digestOf('manifest.json');
    if (remoteManifest && remoteManifest !== localHash('manifest.json')) {
      record('warn', `release ${tag} 内 manifest.json 与仓库一致`, '哈希不同：资产里的版本可能不是 ' + tag);
    } else {
      record('info', `release ${tag} 内 manifest.json 与仓库一致`, remoteManifest ? '哈希一致' : '无 digest，跳过');
    }
  }

  if (latest.name && latest.name !== latest.tag_name) {
    record('warn', 'release 名与 tag 一致', `name="${latest.name}" tag="${latest.tag_name}"`);
  } else {
    record('info', 'release 名与 tag 一致', latest.tag_name);
  }
}

const manifest = checkManifest();
if (manifest) {
  checkPackageVersion(manifest);
  checkVersions(manifest);
  checkBuild();
  checkCatalog();
  checkNoSecrets();
  checkWorkflow();
  await checkRemote(manifest);
}

const errors = results.filter((r) => r.level === 'error');
const warns = results.filter((r) => r.level === 'warn');
console.log(`\n${errors.length ? '✗' : '✓'} ${results.length} 项检查：${errors.length} 错误 / ${warns.length} 警告`);
process.exit(errors.length ? 1 : 0);
