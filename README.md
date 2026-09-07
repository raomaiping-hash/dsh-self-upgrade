<h1 align="center">dsh-self-upgrade</h1>

<p align="center">DeepSeek Harness 本体自升级插件：检测官方新版、自动备份、一键升级；自动更新等待系统空闲才重启，不打断进行中的会话。</p>

<p align="center"><a href="#capabilities">Capabilities</a> · <a href="#install">Install</a> · <a href="#how-auto-update-works">Auto-update</a> · <a href="#security-model">Security</a> · <a href="README.zh.md">中文说明</a></p>

An in-place self-upgrade plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent. It detects new official versions from GitHub Releases, backs up your data, upgrades the globally installed `@deepseek-ai/dsh` package to a newer official version (npm install, or source build when npm lacks the tag), and restarts the service — with an idle-aware auto-update mode that never interrupts a running session. Downgrade/rollback is intentionally not supported.

## Capabilities

| Tool | Description |
| --- | --- |
| `dsh_upgrade_status` | Installed vs latest official version, upgrade job progress, pending restart state, log tail |
| `dsh_upgrade_run` | Upgrade / reinstall: backup → npm install (source build when npm lacks the tag) → verify → delayed restart |
| `dsh_upgrade_cancel_restart` | Cancel a pending scheduled restart or an idle-waiting auto restart |
| `dsh_upgrade_versions` | List official released versions with dates, current/newer markers and release notes |

| Panel（设置 → 插件 → DSH 本体升级） | Description |
| --- | --- |
| Version header | Installed → latest, status pill（已是最新 / 可升级 / 进行中 / 失败） |
| Actions | 检查更新 · 自动更新开关 · 一键升级 · 版本历史（浏览） · 立即重启 · 取消挂起重启 |
| Progress | 升级任务实时阶段进度条 |

## Install

Official bundle plugin — one line, no build step, no install scripts:

```sh
dsh plugin --profile web add github:raomaiping-hash/dsh-self-upgrade
```

Pin a version for reproducibility:

```sh
dsh plugin --profile web add github:raomaiping-hash/dsh-self-upgrade#v1.1.1
```

Then restart the web profile (`sudo systemctl restart deepseek-harness` or your equivalent). A new “DSH 本体升级” tab appears under Settings → Plugins, and four `dsh_upgrade_*` tools become available to the agent.

## How auto-update works

When enabled (panel toggle), every 30 minutes the plugin:

1. Fetches official GitHub Releases; if a newer version exists:
2. Backs up `$HOME/.dsh`, then `npm install -g @deepseek-ai/dsh@<version>` (disk only — the running process is untouched);
3. Starts an idle watcher (every 15 s): restart fires only when no background job is running **and** session logs have been quiet for 2 minutes;
4. On idle it schedules the service restart immediately. Cancel anytime with `dsh_upgrade_cancel_restart`.

Manual upgrades keep explicit control: you choose the delay, default 5 seconds. Only versions newer than the installed one can be installed; rollback is not supported.

## Security model

- The settings panel API answers **loopback Host only** (`127.0.0.1` / `localhost` / `::1`) — it can trigger installs and service restarts, so it is never exposed through reverse proxies or tunnels. Remote management goes through the logged-in agent session (`dsh_upgrade_*` tools).
- Privileged steps use passwordless `sudo` for exactly three commands: the backup script, `npm install -g`, and a transient `systemd-run` unit that restarts the service. Nothing else is elevated.
- No telemetry; external calls are limited to GitHub Releases, the npm registry and the local systemd.

## Requirements

- DeepSeek Harness web profile
- Linux with systemd, deployed as a service user whose `sudo -n` may run the three whitelisted commands above
- `git` on PATH for version probes

## Test

```sh
node tests/contract.mjs
```

Validates the npm/bundle contract (manifest fields, entry exports, client registration marker, patch row) and scans published files for embedded secrets.

## 插件管理

已装插件用 plugin-registry 的**薄控制台**管理（浏览器面板）：管理 profile 插件安装态（bundle 层栈 + insert 行 + 启停），无需手改配置。

## License

MIT
