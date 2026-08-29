import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
// dsh-self-upgrade — DSH 本体自升级插件（常驻版）
// 功能：官方 GitHub Releases 版本检测（含更新说明）、自动备份、npm 升级/回退、
//       降级自动凭据兼容化（防 .credentials.yaml 格式迁移导致的启动循环）、
//       延迟重启调度、模型工具 + 设置页可视面板。

export const name = "dsh-self-upgrade";
// timer：自动更新的 30 分钟检查循环用 ctx.interval（0811 严格注入必须声明，
// 否则开启自动更新时 setMonitor 抛 cannot get property "timer" without inject）。
// jobs：空闲判定——有后台任务运行时不允许自动重启。
export const inject = ["shell", "webServer", "tools", "timer", "jobs"];

const CONST = {
  pkgJson: '/opt/node-v22.23.2-linux-x64/lib/node_modules/@deepseek-ai/dsh/package.json',
  pkgName: '@deepseek-ai/dsh',
  proxy: 'http://127.0.0.1:7890',
  serviceUnit: 'deepseek-harness.service',
  restartUnit: 'dsh-self-upgrade-restart',
  backupScript: '/usr/local/bin/dsh-backup.sh',
  backupDir: '/var/backups/dsh',
  registryUrl: 'https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest',
  packumentUrl: 'https://registry.npmjs.org/@deepseek-ai%2Fdsh',
  atomUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases.atom',
  // 源码构建回退：npm registry 尚无目标版本（GitHub 已发 tag）时，
  // 用 build-from-source.py 从 GitHub tag 构建独立部署目录替换全局包。
  gitRepo: 'https://github.com/deepseek-ai/deepseek-harness.git',
  globalPkgDir: '/opt/node-v22.23.2-linux-x64/lib/node_modules/@deepseek-ai/dsh',
  srcBuildWorkdir: '/var/tmp/dsh-build',   // 源码+构建缓存根（磁盘，勿放 tmpfs）
};

const FLATTEN_PY = `import sys, os, yaml
p = sys.argv[1]
d = yaml.safe_load(open(p, encoding='utf-8')) or {}
if not isinstance(d, dict):
    sys.exit(3)
if 'refs' not in d and 'version' not in d:
    print('already-flat')
    sys.exit(0)
out = {}
for k, v in d.items():
    if k in ('version', 'refs'):
        continue
    if isinstance(v, str):
        out[k] = v
refs = d.get('refs')
if isinstance(refs, dict):
    for k, v in refs.items():
        if isinstance(v, str):
            out[k] = v
        elif isinstance(v, dict) and isinstance(v.get('value'), str):
            out[k] = v['value']
if not out:
    sys.exit(4)
st = os.stat(p)
tmp = p + '.flat-tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    yaml.safe_dump(out, f, sort_keys=True, default_flow_style=False, allow_unicode=True)
os.chmod(tmp, st.st_mode & 0o777)
os.replace(tmp, p)
print('flattened:' + str(len(out)))
`;

const state = {
  phase: 'idle', stage: '', startedAt: null, target: null, error: null, result: null,
  log: [],
  latest: { version: null, fetchedAt: 0, error: null },
  releases: { list: null, fetchedAt: 0, error: null },
};
let upgrading = false
let shell = null;
let autoUpdate = false;
let monitorStop = null;
let idleStop = null;          // 空闲观察器（安装完成后等待空闲再重启）
let pendingAutoRestart = null; // { reason, since } | null
let ctxJobs = null;           // jobs 服务（apply 时捕获，用于空闲判定）

function configPath() { return homedir() + '/.dsh/dsh-self-upgrade.json' }
async function loadConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    autoUpdate = !!j.autoUpdate;
  } catch (e) {}
}
function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify({ autoUpdate: autoUpdate })) } catch (e) {}
}

function log(msg) {
  const line = new Date().toISOString() + ' [' + (state.stage || state.phase) + '] ' + msg;
  state.log.push(line);
  if (state.log.length > 200) state.log.shift();
  console.log('[dsh-self-upgrade] ' + line);
}

async function sh(command, timeoutMs, maxBytes) {
  const r = await shell.run({
    command, timeoutMs: timeoutMs || 30000, stdoutMaxBytes: maxBytes || 262144,
    sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/' },
  });
  const textOf = (o) => (o && typeof o === 'object') ? String(o.text || '') : String(o || '');
  return {
    exitCode: r ? r.exitCode : null,
    timedOut: !!(r && r.timedOut),
    stdout: textOf(r && r.stdout),
    stderr: textOf(r && r.stderr),
  };
}

function parseVer(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null };
}

function cmpVer(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  const sa = pa.pre.split('.'), sb = pb.pre.split('.');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i], y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (+x !== +y) return +x < +y ? -1 : 1; }
    else if (nx !== ny) return nx ? -1 : 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function bin(name, fallback) {
  const r = await sh('command -v ' + name + ' 2>/dev/null');
  const p = (r.stdout || '').trim().split('\n')[0];
  return p || fallback;
}

async function installedVersion() {
  const r = await sh('cat ' + CONST.pkgJson);
  try { return JSON.parse(r.stdout).version || null } catch (e) { return null }
}

async function fetchLatest() {
  const curl = await bin('curl', '/usr/bin/curl');
  let r = await sh(curl + " -sS -m 12 -x " + CONST.proxy + " '" + CONST.registryUrl + "'", 20000);
  if (r.exitCode !== 0 || r.stdout.indexOf('{') !== 0) {
    r = await sh(curl + " -sS -m 12 '" + CONST.registryUrl + "'", 20000);
  }
  try {
    const v = JSON.parse(r.stdout).version;
    if (v) { state.latest = { version: v, fetchedAt: Date.now(), error: null }; return v }
  } catch (e) {}
  state.latest.error = (('' + r.stderr + r.stdout).trim().slice(0, 160)) || ('curl exit ' + r.exitCode);
  return null;
}

async function latestCached(maxAgeMs) {
  if (!state.latest.version || Date.now() - state.latest.fetchedAt > (maxAgeMs || 300000)) await fetchLatest();
  return state.latest.version;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function fetchReleases() {
  const curl = await bin('curl', '/usr/bin/curl');
  let r = await sh(curl + " -sS -m 15 '" + CONST.atomUrl + "'", 25000, 1048576);
  if (r.exitCode !== 0 || r.stdout.indexOf('<entry>') < 0) {
    r = await sh(curl + " -sS -m 15 -x " + CONST.proxy + " '" + CONST.atomUrl + "'", 25000, 1048576);
  }
  if (r.exitCode !== 0 || r.stdout.indexOf('<entry>') < 0) {
    state.releases.error = (('' + r.stderr).trim().slice(0, 140)) || 'atom 无条目';
    return null;
  }
  const out = [];
  const re = /<entry>[\s\S]*?<\/entry>/g;
  let m;
  while ((m = re.exec(r.stdout)) !== null) {
    const e = m[0];
    const t = /<title>([^<]*)<\/title>/.exec(e);
    const u = /<updated>([^<]*)<\/updated>/.exec(e);
    const ver = t ? String(t[1]).trim().replace(/^v/, '') : '';
    if (!parseVer(ver)) continue;
    const c = /<content type="html">([\s\S]*?)<\/content>/.exec(e);
    let notes = '';
    if (c) {
      notes = decodeHtml(c[1]);
      if (notes.length > 12000) notes = notes.slice(0, 12000) + '…';
    }
    out.push({ version: ver, date: u ? String(u[1]).slice(0, 10) : '', notes });
  }
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return cmpVer(b.version, a.version);
  });
  state.releases = { list: out, fetchedAt: Date.now(), error: out.length ? null : '解析到 0 个版本' };
  return out.length ? out : null;
}

async function releasesCached(maxAgeMs) {
  if (!state.releases.list || Date.now() - state.releases.fetchedAt > (maxAgeMs || 300000)) await fetchReleases();
  return state.releases.list;
}

function validateVersion(v) {
  if (typeof v !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(v)) return null;
  return v;
}

async function timerActive(sctl) {
  const a = await sh(sctl + ' is-active ' + CONST.restartUnit + '.timer');
  return (a.stdout || '').trim() === 'active';
}

async function flattenCredentials() {
  const home = ((await sh('printf %s "$HOME"')).stdout || '').trim() || '/root';
  const cred = home + '/.dsh/.credentials.yaml';
  const ex = await sh('test -f ' + cred + ' && echo YES || echo NO');
  if (ex.stdout.indexOf('YES') < 0) return { status: 'absent' };
  const py = await bin('python3', '/usr/bin/python3');
  const chk = await sh(py + ' -c "import yaml" 2>/dev/null');
  if (chk.exitCode !== 0) return { status: 'no-pyyaml' };
  const script = '/tmp/dsh-flatten-cred.py';
  fs.writeFileSync(script, FLATTEN_PY, { mode: 0o700 });
  const r = await sh(py + ' ' + script + ' ' + cred);
  if (r.exitCode === 0) {
    const out = (r.stdout || '').trim();
    if (out === 'already-flat') return { status: 'already-flat' };
    const m = /^flattened:(\d+)$/.exec(out);
    if (m) return { status: 'flattened', keys: +m[1] };
    return { status: out || 'unknown' };
  }
  if (r.exitCode === 4) return { status: 'error', detail: '结构化文件中未提取到任何凭据' };
  if (r.exitCode === 3) return { status: 'error', detail: '文件不是映射结构' };
  return { status: 'error', detail: (('' + r.stderr) || ('exit ' + r.exitCode)).slice(0, 160) };
}

// 源码构建回退：当 npm registry 上没有目标版本（GitHub 已发 tag 但 npm 未
// 同步，典型如 alpha/rc 预发布版）时，调用 build-from-source.py 从源码构建
// 独立部署目录，并整体替换全局 @deepseek-ai/dsh。返回 { mode, deployDir, log }。
async function buildFromSource(target) {
  const workdir = CONST.srcBuildWorkdir + '-' + target;
  const out = workdir + '/deploy';
  const py = await bin('python3', '/usr/bin/python3');
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-from-source.py');
  if (!fs.existsSync(script)) throw new Error('缺少构建脚本: ' + script);
  log('源码构建安装: ' + CONST.gitRepo + ' @ ' + target);
  const r = await sh(py + ' ' + script + ' ' + target + ' --workdir ' + workdir + ' --out ' + out, 3600 * 1000, 2 * 1024 * 1024);
  if (r.exitCode !== 0) {
    throw new Error('源码构建失败(exit ' + r.exitCode + ')：' + ((r.stdout || r.stderr) + '').slice(-500));
  }
  if (!fs.existsSync(out + '/lib/bin.js')) throw new Error('构建产物缺少 lib/bin.js: ' + out);
  return { mode: 'source-build', deployDir: out };
}

// 把构建产物部署到全局：先备份旧包目录，再整体替换。
async function deployFromSource(target, deployDir) {
  const g = CONST.globalPkgDir;
  const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const bak = CONST.backupDir + '/dsh-pkg-' + ts + '.tar.gz';
  const r = await sh('sudo -n sh -c "mkdir -p ' + CONST.backupDir + ' && tar czf ' + bak + ' -C ' + path.dirname(g) + ' ' + path.basename(g) + ' && rm -rf ' + g + ' && mkdir -p ' + g + ' && cp -a ' + deployDir + '/. ' + g + '"', 600000);
  if (r.exitCode !== 0) throw new Error('部署到全局失败：' + ((r.stderr || r.stdout) + '').slice(-300));
  log('已替换全局包，备份: ' + bak);
  return bak;
}

async function performUpgrade(opts) {
  upgrading = true;
  state.phase = 'running'; state.startedAt = Date.now(); state.error = null; state.result = null; state.target = opts.target;
  try {
    state.stage = 'preflight';
    const cur = await installedVersion();
    if (!cur) throw new Error('无法读取已安装版本（' + CONST.pkgJson + '）');
    const isDowngrade = cmpVer(opts.target, cur) < 0;
    log('current=' + cur + ' target=' + opts.target + ' force=' + !!opts.force + ' downgrade=' + isDowngrade);
    const c = cmpVer(opts.target, cur);
    if (c <= 0 && !opts.force) {
      state.phase = 'idle'; state.stage = '';
      state.result = { action: 'none', reason: c === 0 ? '已是目标版本' : '目标版本低于当前版本（回退请用 force）', current: cur, target: opts.target };
      return state.result;
    }
    if (!opts.skipBackup) {
      state.stage = 'backup';
      const b = await sh('test -x ' + CONST.backupScript + ' && sudo -n ' + CONST.backupScript + ' || echo NO_BACKUP_SCRIPT', 180000);
      if (b.stdout.indexOf('NO_BACKUP_SCRIPT') >= 0) {
        const home = ((await sh('printf %s "$HOME"')).stdout || '').trim() || '/root';
        const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const tb = await sh('sudo -n sh -c "mkdir -p ' + CONST.backupDir + ' && tar czf ' + CONST.backupDir + '/dsh-pre-upgrade-' + ts + '.tar.gz -C ' + home + ' .dsh"', 180000);
        if (tb.exitCode !== 0) throw new Error('fallback tar 备份失败：' + (tb.stderr || '').slice(0, 200));
        log('fallback tar 备份完成');
      } else if (b.exitCode !== 0) {
        throw new Error('备份失败，中止升级：' + (b.stderr || b.stdout || '').slice(0, 200));
      } else {
        log('dsh-backup.sh 备份完成');
      }
      const ls = await sh('ls -t ' + CONST.backupDir + '/*.tar.gz 2>/dev/null | head -1');
      state.result = { action: 'upgrade', backupPath: (ls.stdout || '').trim() || null, rollbackOf: isDowngrade };
    }
    state.stage = 'install';
    const npm = await bin('npm', '/opt/node-v22.23.2-linux-x64/bin/npm');
    const pe = 'http_proxy=' + CONST.proxy + ' https_proxy=' + CONST.proxy + ' HTTP_PROXY=' + CONST.proxy + ' HTTPS_PROXY=' + CONST.proxy + ' no_proxy=localhost,127.0.0.1';
    log('npm install -g ' + CONST.pkgName + '@' + opts.target);
    const inst = await sh('sudo -n env ' + pe + ' ' + npm + ' install -g ' + CONST.pkgName + '@' + opts.target + ' --no-audit --no-fund 2>&1 | tail -20', 900000);
    const instOut = ((inst.stdout || '') + ' ' + (inst.stderr || ''));
    if (inst.exitCode !== 0) {
      // npm registry 尚无目标版本（GitHub 已发 tag 但 npm 未同步，如 alpha/rc
      // 预发布版）时自动回退到源码构建安装，而不是直接失败。
      const isNotarget = /ETARGET|notarget|No matching version found/i.test(instOut);
      if (isNotarget) {
        log('npm 上不存在 ' + opts.target + '（ETARGET），回退源码构建安装');
        const built = await buildFromSource(opts.target);
        state.stage = 'deploy';
        const bak = await deployFromSource(opts.target, built.deployDir);
        state.result = Object.assign(state.result || { action: 'upgrade' }, { installMode: 'source-build', backupPkg: bak });
        log('源码构建部署完成: ' + built.deployDir);
      } else {
        throw new Error('npm 安装失败(exit ' + inst.exitCode + ')：' + instOut.slice(-400));
      }
    } else {
      log('npm 尾部输出: ' + (inst.stdout || '').slice(-160).replace(/\s+/g, ' '));
    }
    state.stage = 'verify';
    const now = await installedVersion();
    if (!now || cmpVer(now, opts.target) !== 0) {
      throw new Error('升级后校验失败：磁盘版本 ' + now + ' ≠ 目标 ' + opts.target + '。回滚命令: sudo env ' + pe + ' ' + npm + ' i -g ' + CONST.pkgName + '@' + cur);
    }
    log('校验通过: ' + now);
    state.result = Object.assign(state.result || { action: 'upgrade' }, { previous: cur, installed: now });
    if (isDowngrade) {
      state.stage = 'compat';
      const fr = await flattenCredentials();
      state.result.compat = fr;
      log('凭据兼容化: ' + JSON.stringify(fr));
      if (fr.status === 'error') throw new Error('凭据兼容化失败：' + fr.detail + '；为避免启动循环已中止，可先手动处理或用备份恢复。');
    }
    if (!opts.skipRestart) {
      state.stage = 'restart-schedule';
      const ok = await scheduleRestart(delay);
      if (!ok) {
        state.result.restartScheduled = false;
        state.result.restartNote = 'systemd-run 失败，请手动重启: sudo systemctl restart ' + CONST.serviceUnit;
        log(state.result.restartNote);
      } else {
        state.result.restartScheduled = true;
        state.result.restartDelaySec = delay;
        log('已安排 ' + delay + ' 秒后重启 ' + CONST.serviceUnit);
      }
    }
    state.phase = 'idle'; state.stage = '';
    log('done: ' + JSON.stringify(state.result));
    return state.result;
  } catch (e) {
    state.phase = 'failed'; state.error = String((e && e.message) || e); state.stage = '';
    state.result = Object.assign({}, state.result || {}, { action: 'error', error: state.error });
    log('FAILED: ' + state.error);
    return state.result;
  } finally {
    upgrading = false;
  }
}

async function scheduleRestart(delay) {
  const sctl = await bin('systemctl', '/usr/bin/systemctl');
  const srun = await bin('systemd-run', '/usr/bin/systemd-run');
  await sh('sudo -n ' + sctl + ' stop ' + CONST.restartUnit + '.timer ' + CONST.restartUnit + '.service');
  const sch = await sh('sudo -n ' + srun + ' --on-active=' + delay + 's --unit=' + CONST.restartUnit + ' --collect ' + sctl + ' restart ' + CONST.serviceUnit, 15000);
  return sch.exitCode === 0;
}

// 空闲判定：无运行中的后台任务，且最近 2 分钟没有会话日志写入。
// 会话日志在活跃回合（工具调用/事件追加）期间持续更新，静默即代表无进行中工作。
async function systemIdle() {
  if (upgrading) return false;
  try {
    if (ctxJobs && typeof ctxJobs.list === 'function') {
      const snaps = ctxJobs.list() || [];
      const running = snaps.filter(function (s) {
        return s && typeof s.status === 'string' && /run|active|pending/i.test(s.status);
      });
      if (running.length > 0) return false;
    }
  } catch (e) {}
  try {
    const out = await sh('find ' + homedir() + '/.dsh/sessions -type f -mmin -2 2>/dev/null | head -1', 10000);
    if ((out.stdout || '').trim() !== '') return false;
  } catch (e) {}
  return true;
}

async function statusPayload() {
  const cur = await installedVersion();
  const rels = await releasesCached(300000);
  let latest = rels && rels.length ? rels[0].version : null;
  let latestSource = 'github';
  if (!latest) {
    latest = await latestCached(300000);
    latestSource = 'npm-fallback';
  }
  const sctl = await bin('systemctl', '/usr/bin/systemctl');
  let pendingRestart = null;
  if (await timerActive(sctl)) {
    const ne = await sh(sctl + ' show ' + CONST.restartUnit + '.timer -p NextElapseUSecRealtime --value');
    pendingRestart = { nextElapse: (ne.stdout || '').trim() || null };
  }
  return {
    installedVersion: cur,
    latestVersion: latest,
    latestSource,
    latestError: state.releases.error || state.latest.error || null,
    upToDate: !!(cur && latest && cmpVer(cur, latest) >= 0),
    autoUpdate: autoUpdate,
    job: { phase: state.phase, stage: state.stage, target: state.target, startedAt: state.startedAt, error: state.error, result: state.result },
    pendingRestart,
    pendingAutoRestart,
    logTail: state.log.slice(-12),
  };
}

async function startUpgrade(args) {
  if (upgrading) return { started: false, reason: '已有升级任务进行中，请稍候' };
  let target;
  if (args.version) {
    target = validateVersion(args.version);
    if (!target) return { started: false, reason: '版本号格式非法：' + args.version };
  } else {
    const rels = await releasesCached(60000);
    if (rels && rels.length) target = rels[0].version;
    else target = await latestCached(60000);
    if (!target) return { started: false, reason: '获取最新官方版本失败: ' + (state.releases.error || state.latest.error || 'unknown') };
  }
  const cur = await installedVersion();
  const isDowngrade = !!(cur && cmpVer(target, cur) < 0);
  const delay = Math.max(2, Math.min(600, Number(args.restartDelaySec) || 5));
  const opts = { target, restartDelaySec: delay, skipRestart: !!args.skipRestart, skipBackup: !!args.skipBackup, force: !!args.force || isDowngrade };
  performUpgrade(opts).catch(function () {});
  return {
    started: true, target,
    plan: (isDowngrade ? '回退' : '升级') + '：备份 → npm install -g → 校验' + (isDowngrade ? ' → 凭据兼容化' : '') + (opts.skipRestart ? '（不重启）' : (' → ' + delay + ' 秒后重启 ' + CONST.serviceUnit)),
    warning: isDowngrade ? '检测到降级：将在重启前自动把凭据文件转为两版通用的扁平格式（防启动循环）；若新版还迁移过其他配置导致启动异常，请从 /var/backups/dsh/ 最新备份恢复对应文件。' : null,
    note: '安装仅替换磁盘文件，不影响运行中进程；重启会结束当前会话并短暂中断 Web UI。',
  };
}

async function cancelRestart() {
  if (idleStop) {
    try { idleStop(); } catch (e) {}
    idleStop = null;
    pendingAutoRestart = null;
    log('已取消空闲重启等待');
  }
  const sctl = await bin('systemctl', '/usr/bin/systemctl');
  const wasActive = await timerActive(sctl);
  if (!wasActive) return { wasPending: false, stopped: true };
  const st = await sh('sudo -n ' + sctl + ' stop ' + CONST.restartUnit + '.timer ' + CONST.restartUnit + '.service');
  const stillActive = await timerActive(sctl);
  return {
    wasPending: true, stopped: !stillActive,
    diag: { exitCode: st.exitCode, timedOut: st.timedOut, stderr: st.stderr.slice(0, 240) },
  };
}

async function versionList() {
  const rels = await releasesCached(300000);
  if (!rels) return { error: '获取官方发布列表失败: ' + (state.releases.error || 'unknown'), source: 'github' };
  const cur = await installedVersion();
  const rows = rels.map(function (x) {
    return { version: x.version, date: x.date, official: true, newer: cmpVer(x.version, cur) > 0, notes: x.notes || '' };
  }).slice(0, 12);
  return { installed: cur, latest: rows.length ? rows[0].version : null, source: 'github-releases', versions: rows };
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c);
    });
    req.on('end', function () {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)) } catch (e) { reject(new Error('invalid json')) }
    });
    req.on('error', reject);
  });
}

export function apply(ctx, config) {
  shell = ctx.shell;
  ctxJobs = ctx.get('jobs');
  const webServer = ctx.webServer;

  // ── 自动更新监控 ──
  // 空闲观察器：安装完成后等系统空闲（无后台任务且会话日志静默 2 分钟），
  // 空闲立即重启；首个 tick 即空闲则马上重启。取消用 dsh_upgrade_cancel_restart。
  function beginIdleRestart(target) {
    if (idleStop) return;
    pendingAutoRestart = { reason: '自动更新 ' + target, since: new Date().toISOString() };
    log('已安装 ' + target + '，等待系统空闲后重启（每 15 秒检查）');
    idleStop = ctx.interval(async function () {
      try {
        if (upgrading || !pendingAutoRestart) return;
        if (!(await systemIdle())) return;
        const cur = await installedVersion();
        if (!cur || cmpVer(cur, target) < 0) {
          log('磁盘版本未达 ' + target + '，取消空闲重启');
          idleStop(); idleStop = null; pendingAutoRestart = null;
          return;
        }
        idleStop(); idleStop = null;
        const reason = pendingAutoRestart.reason;
        pendingAutoRestart = null;
        log('系统空闲，立即重启以应用 ' + reason);
        const ok = await scheduleRestart(5);
        if (!ok) log('systemd-run 失败，请手动重启: sudo systemctl restart ' + CONST.serviceUnit);
      } catch (e) { log('空闲重启检查失败: ' + String((e && e.message) || e)) }
    }, 15000);
  }

  function setMonitor(on) {
    if (on && !monitorStop) {
      monitorStop = ctx.interval(async function () {
        try {
          if (upgrading) return;
          const rels = await releasesCached(0);
          if (!rels || !rels.length) return;
          const cur = await installedVersion();
          if (cmpVer(rels[0].version, cur) > 0) {
            log('自动更新：检测到新官方版 ' + rels[0].version + '，开始升级（装完等空闲再重启）');
            beginIdleRestart(rels[0].version);
            await startUpgrade({ skipRestart: true });
          }
        } catch (e) { log('自动更新检查失败: ' + String((e && e.message) || e)) }
      }, 30 * 60 * 1000);
    } else if (!on && monitorStop) { monitorStop(); monitorStop = null; }
  }
  loadConfig().then(function () { if (autoUpdate) setMonitor(true) }).catch(function () {});

  // ── 模型工具 ──
  const jsonRender = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  const objSchema = { type: 'object', additionalProperties: false, properties: {} };

  ctx.tools.register({
    name: 'dsh_upgrade_status',
    description: '查看 DSH 本体版本状态与升级任务进度：已安装版本、最新官方发布版（GitHub Releases）、是否已最新、进行中/最近一次升级任务的状态与日志尾部、以及是否有挂起的延迟重启（挂起时可用 dsh_upgrade_cancel_restart 取消）。',
    parameters: objSchema,
    output: { schema: { type: 'object' }, render: jsonRender },
    execute: async function () { return statusPayload() },
  });

  ctx.tools.register({
    name: 'dsh_upgrade_run',
    description: '升级/回退/重装 DSH agent 本体。默认目标为最新官方发布版（GitHub Releases）；回退传 version=<旧版本>（自动 force）。流程：备份 → npm 安装 → 校验 → 降级时自动扁平化凭据文件（防配置格式不兼容的启动循环）→ systemd-run 延迟重启 deepseek-harness.service。注意：安装只替换磁盘文件、不影响运行中进程；随后的重启会结束当前会话并短暂中断 Web UI（默认延迟 5 秒，近立即）。本工具立即返回，进度用 dsh_upgrade_status 轮询。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: { type: 'string', description: '目标版本号（默认取最新官方发布版；传旧版本号即回退）' },
        force: { type: 'boolean', description: '目标不高于当前版本时仍强制执行（回退时自动启用）' },
        restartDelaySec: { type: 'number', description: '重启延迟秒数，2–600，默认 5（近立即）' },
        skipRestart: { type: 'boolean', description: '只安装，不安排重启' },
        skipBackup: { type: 'boolean', description: '跳过升级前备份（不建议）' },
      },
    },
    output: { schema: { type: 'object' }, render: jsonRender },
    execute: async function (args) { return startUpgrade(args || {}) },
  });

  ctx.tools.register({
    name: 'dsh_upgrade_versions',
    description: '列出官方 GitHub Releases 发布过的 DSH 版本（含日期、最新/当前安装标记、newer 标记与 notes 官方更新说明 HTML），用于选择升级/回退目标。只收录官方发布版，不含 npm 过渡构建。',
    parameters: objSchema,
    output: { schema: { type: 'object' }, render: jsonRender },
    execute: async function () { return versionList() },
  });

  ctx.tools.register({
    name: 'dsh_upgrade_cancel_restart',
    description: '取消由 dsh_upgrade_run 安排的延迟重启（停止 dsh-self-upgrade-restart.timer 瞬态单元），停止后复查确认。返回取消前是否存在挂起重启及原始诊断。',
    parameters: objSchema,
    output: { schema: { type: 'object' }, render: jsonRender },
    execute: async function () { return cancelRestart() },
  });

  // ── 面板 HTTP API ──
  if (webServer !== undefined) {
    const json = (res, code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    // 面板 API 访问控制：允许 loopback 与本机可信 Host 列表（与服务
    // --trusted-host 保持一致：LAN IP、tailscale 域名、公网域名）。
    // 这些路由能触发本体升级与重启，白名单之外的 Host 一律 403；
    // 远程管理仍可走登录后的 agent 会话（dsh_upgrade_* 工具）。
    const ALLOWED_HOSTS = [
      '127.0.0.1', 'localhost', '::1',
      '192.168.1.12', '192.168.1.3', '192.168.1.5',
      '192.168.31.168', '192.168.31.237', '192.168.5.25',
      '100.124.102.103',
      'rmp-n100', 'rmp-n100.tail4098df.ts.net', 'deepseek.raomaiping.host',
    ].map((x) => String(x).trim().toLowerCase());
    const isLoopbackHost = (h) => {
      let s = String(h || '').trim().toLowerCase();
      if (s === '') return false;
      const slash = s.indexOf('/');
      if (slash >= 0) s = s.slice(0, slash);
      let hostOnly = s;
      if (s.startsWith('[')) { const c = s.indexOf(']'); if (c > 0) hostOnly = s.slice(1, c); }
      else { const colon = s.lastIndexOf(':'); if (colon > 0 && /^\d+$/.test(s.slice(colon + 1))) hostOnly = s.slice(0, colon); }
      if (hostOnly === 'localhost' || hostOnly === '::1' || hostOnly.startsWith('::ffff:127.')) return true;
      if (hostOnly.startsWith('127.')) {
        const parts = hostOnly.split('.');
        if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return true;
      }
      // 白名单：域名（如 rmp-n100.tail4098df.ts.net / deepseek.raomaiping.host）
      // 与 LAN/tailscale IP 均放行；带端口形式（:443 / :3080）也放行。
      if (ALLOWED_HOSTS.indexOf(hostOnly) >= 0) return true;
      if (ALLOWED_HOSTS.indexOf(s) >= 0) return true;
      return false;
    };
    const route = (path, fn) => ctx.effect(() => webServer.register({
      kind: 'exact', path,
      handler: async function (req, res) {
        try {
          if (!isLoopbackHost(req.headers.host)) {
            json(res, 403, { error: 'forbidden: upgrade panel answers loopback only; manage upgrades via the in-session dsh_upgrade_* tools' });
            return;
          }
          const body = req.method === 'POST' ? await readJsonBody(req) : {};
          json(res, 200, await fn(body));
        } catch (e) {
          json(res, 500, { error: String((e && e.message) || e) });
        }
      },
    }), 'dsh-self-upgrade: ' + path);

    route('/api/dsh-upgrade/status', async function () { return statusPayload() });
    route('/api/dsh-upgrade/run', async function (args) { return startUpgrade(args || {}) });
    route('/api/dsh-upgrade/cancel', async function () { return cancelRestart() });
    route('/api/dsh-upgrade/restart', async function (args) {
      const delay = Math.max(2, Math.min(600, Number(args && args.delaySec) || 5));
      const ok = await scheduleRestart(delay);
      if (!ok) throw new Error('systemd-run 失败，请手动重启: sudo systemctl restart ' + CONST.serviceUnit);
      log('面板触发：' + delay + ' 秒后重启 ' + CONST.serviceUnit);
      return { scheduled: true, delaySec: delay };
    });
    route('/api/dsh-upgrade/versions', async function () { return versionList() });
    route('/api/dsh-upgrade/auto', async function (args) {
      autoUpdate = !!(args && args.enabled);
      saveConfig();
      setMonitor(autoUpdate);
      log('自动更新已' + (autoUpdate ? '开启（每 30 分钟检查官方版本）' : '关闭'));
      return { enabled: autoUpdate };
    });
  } else {
    console.error('[dsh-self-upgrade] webServer 不可用，面板 API 未注册（模型工具不受影响）');
  }

  console.log('[dsh-self-upgrade] 常驻版已加载：4 工具 + 面板 API');
}
