<h1 align="center">dsh-self-upgrade</h1>

<p align="center">DeepSeek Harness 本体自升级插件：检测官方新版、自动备份、一键升级/回退；自动更新等待系统空闲才重启，不打断进行中的会话。</p>

<p align="center"><a href="#功能">功能</a> · <a href="#安装">安装</a> · <a href="#自动更新机制">自动更新机制</a> · <a href="#安全模型">安全模型</a> · <a href="README.md">English</a></p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent 的原地自升级插件：从 GitHub Releases 检测官方新版，自动备份数据，升级/回退全局安装的 `@deepseek-ai/dsh` 包并重启服务——自动更新模式会**等待系统空闲**才重启，绝不打断进行中的会话。

## 功能

| 模型工具 | 说明 |
| --- | --- |
| `dsh_upgrade_status` | 已装版本 vs 官方最新版、升级任务进度、挂起重启状态、日志尾部 |
| `dsh_upgrade_run` | 升级 / 回退 / 重装：备份 → npm 安装 → 校验 →（降级）凭据兼容化 → 延迟重启 |
| `dsh_upgrade_cancel_restart` | 取消挂起的定时重启或正在等空闲的自动重启 |
| `dsh_upgrade_versions` | 列出官方发布过的版本（日期、当前/更新标记、官方更新说明） |

| 面板（设置 → 插件 → DSH 本体升级） | 说明 |
| --- | --- |
| 版本头 | 已装 → 最新，状态徽章（已是最新 / 可升级 / 进行中 / 失败） |
| 操作 | 检查更新 · 自动更新开关 · 一键升级 · 版本历史与回退 · 立即重启 · 取消挂起重启 |
| 进度 | 升级任务实时阶段进度条 |

## 安装

官方 bundle 插件——一行安装，无构建步骤、无安装脚本：

```sh
dsh plugin --profile web add github:raomaiping-hash/dsh-self-upgrade
```

可复现安装请锁定版本：

```sh
dsh plugin --profile web add github:raomaiping-hash/dsh-self-upgrade#v1.0.0
```

随后重启 web profile（`sudo systemctl restart deepseek-harness` 或等效命令）。设置 → 插件 下出现「DSH 本体升级」标签页，agent 获得 4 个 `dsh_upgrade_*` 工具。

## 自动更新机制

开启（面板开关）后每 30 分钟：

1. 拉取官方 GitHub Releases；发现新版：
2. 备份 `$HOME/.dsh`，然后 `npm install -g @deepseek-ai/dsh@<版本>`（只替换磁盘文件，不影响运行中进程）；
3. 启动空闲观察器（每 15 秒）：仅当**无后台任务运行且会话日志已静默 2 分钟**才判定空闲；
4. 空闲立即安排服务重启。随时可用 `dsh_upgrade_cancel_restart` 取消。

手动升级保持完全控制：延迟自选，默认 5 秒。

降级时自动把 `.credentials.yaml` 扁平化为新旧版本通用的格式，防止配置格式迁移导致的启动循环。

## 安全模型

- 设置面板 API **只允许本机 Host**（`127.0.0.1` / `localhost` / `::1`）访问——它能触发安装与服务重启，绝不暴露给反向代理或隧道。远程管理走登录后的 agent 会话（`dsh_upgrade_*` 工具）。
- 特权步骤的免密 `sudo` 仅限三条命令：备份脚本、`npm install -g`、重启服务的瞬态 `systemd-run` 单元。其余一律不提权。
- 无遥测；外部访问仅限 GitHub Releases、npm registry 与本机 systemd。

## 环境要求

- DeepSeek Harness web profile
- Linux + systemd，部署服务用户的 `sudo -n` 可执行上述三条白名单命令
- PATH 中有 `git`（版本探测用）

## 测试

```sh
node tests/contract.mjs
```

校验 npm/bundle 契约（manifest 字段、entry 导出、client 注册标记、patch 行），并扫描待发布文件是否嵌入密钥。

## 插件管理

已装插件用 plugin-registry 的**薄控制台**管理（浏览器面板）：管理 profile 插件安装态（bundle 层栈 + insert 行 + 启停），无需手改配置。

## 许可证

MIT
