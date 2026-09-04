// dsh-self-upgrade client bundle: 设置页「DSH 本体升级」面板。
window.__ModuleLoader__.load({ id: "dsh-self-upgrade", factory: (require) => {

		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;
		const { useState, useEffect, useCallback } = react;

		const name = "dsh-self-upgrade";
		const inject = ["slots", "timer"];

		const CSS = ".dsup-panel{font-size:13px;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:14px;border:1px solid rgba(128,128,128,.18);background:linear-gradient(180deg,rgba(128,128,128,.07),rgba(128,128,128,.02));box-shadow:0 1px 3px rgba(0,0,0,.08)}.dsup-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dsup-title{display:flex;align-items:baseline;gap:8px;font-weight:600;font-size:14px}.dsup-ver{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px}.dsup-arrow{opacity:.45}.dsup-latest{font-family:ui-monospace,Menlo,Consolas,monospace;opacity:.75}.dsup-pill{padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600}.dsup-pill-ok{color:#16a34a;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4)}.dsup-pill-new{color:#d97706;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.45)}.dsup-pill-run{color:#2563eb;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.4)}.dsup-pill-fail{color:#dc2626;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4)}.dsup-bar{height:6px;border-radius:999px;background:rgba(128,128,128,.15);overflow:hidden;position:relative}.dsup-bar>i{position:absolute;top:0;left:-40%;height:100%;width:40%;border-radius:999px;background:linear-gradient(90deg,#93c5fd,#3b82f6);animation:dsup-slide 1.1s ease-in-out infinite}@keyframes dsup-slide{to{left:100%}}.dsup-stage{opacity:.75;font-size:12px}.dsup-banner{padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.6}.dsup-banner-warn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35)}.dsup-banner-err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3)}.dsup-result{opacity:.85;font-size:12px;line-height:1.6;padding:8px 12px;border-radius:8px;background:rgba(128,128,128,.06)}.dsup-actions{display:flex;gap:8px;flex-wrap:wrap}.dsup-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:9px;border:1px solid rgba(128,128,128,.32);background:transparent;color:inherit;cursor:pointer;font-size:12px;font-weight:500;transition:border-color .15s,background .15s,filter .15s}.dsup-btn:hover:not(:disabled){border-color:rgba(128,128,128,.55);background:rgba(128,128,128,.07)}.dsup-btn:disabled{opacity:.45;cursor:not-allowed}.dsup-btn-primary{background:linear-gradient(135deg,#3b82f6,#2563eb);border-color:transparent;color:#fff;box-shadow:0 2px 6px rgba(37,99,235,.3)}.dsup-btn-primary:hover:not(:disabled){filter:brightness(1.1)}.dsup-btn-danger{color:#ef4444;border-color:rgba(239,68,68,.45)}.dsup-btn-sm{padding:2px 10px;border-radius:7px;font-size:11px}.dsup-vers{display:flex;flex-direction:column;border:1px solid rgba(128,128,128,.2);border-radius:10px;overflow:hidden}.dsup-vrow{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:12px;border-bottom:1px solid rgba(128,128,128,.1)}.dsup-vrow:hover{background:rgba(128,128,128,.05)}.dsup-vrow-last{border-bottom:none}.dsup-vname{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600}.dsup-vdate{opacity:.5;font-size:11px}.dsup-tag{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid rgba(128,128,128,.3);opacity:.9}.dsup-tag-new{color:#2563eb;border-color:rgba(59,130,246,.45)}.dsup-tag-cur{color:#16a34a;border-color:rgba(34,197,94,.45)}.dsup-spacer{flex:1}.dsup-notes{padding:10px 14px;background:rgba(128,128,128,.05);border-top:1px dashed rgba(128,128,128,.22);max-height:280px;overflow:auto;font-size:12px;line-height:1.65;color:inherit}.dsup-notes h3{font-size:12px;margin:10px 0 4px}.dsup-notes ul{margin:4px 0;padding-left:18px}.dsup-notes li{margin:3px 0}.dsup-notes p{margin:4px 0}.dsup-note{opacity:.8;font-size:12px;line-height:1.6}.dsup-meta{opacity:.55;font-size:11px;line-height:1.6}";

		async function api(path, body) {
			const init = body !== undefined
				? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }
				: { cache: "no-store" };
			const r = await fetch(path, init);
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.json();
		}

		const CSS_EXTRA = ".dsup-ver-badge{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:18px;border:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary);background:0 0;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;font-weight:500;white-space:nowrap;gap:7px}.dsup-ver-badge .dsup-ver-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#22c55e}.dsup-ver-badge.dsup-ver-new{color:#d97706;border-color:rgba(245,158,11,.5)}.dsup-ver-badge.dsup-ver-new .dsup-ver-dot{background:#f59e0b}.dsup-foot-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;min-width:34px;padding:0 11px;border-radius:9px;border:1px solid #dc2626;background:#dc2626;color:#fff;cursor:pointer;font-size:12px;font-weight:500;line-height:1;transition:background .12s ease,transform .1s ease}.dsup-foot-btn:hover:not(:disabled){background:#b91c1c}.dsup-foot-btn:active:not(:disabled){transform:translateY(1px)}.dsup-foot-btn:disabled{opacity:.55;cursor:wait}.dsup-foot-icon{flex:none;display:inline-flex}.dsup-foot-wrap{position:relative;display:inline-flex;align-items:center}.dsup-foot-msg{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);white-space:nowrap;font-size:12px;line-height:1;color:#16a34a;background:rgba(255,255,255,.95);border:1px solid rgba(22,163,74,.3);border-radius:7px;padding:4px 9px;box-shadow:0 2px 10px rgba(0,0,0,.14);pointer-events:none;z-index:30}.dsup-foot-msg-err{color:#dc2626;border-color:rgba(220,38,38,.35)}.dsup-foot-armed{outline:2px solid rgba(220,38,38,.55);outline-offset:1px}.hHd-Xa_root:not(.hHd-Xa_collapsed) .hHd-Xa_footArea{flex-direction:row!important;align-items:center!important;gap:8px;justify-content:flex-start}.hHd-Xa_root:not(.hHd-Xa_collapsed) .hHd-Xa_settingsArea{order:0;flex:none;width:auto;min-width:0}.hHd-Xa_root:not(.hHd-Xa_collapsed) .hHd-Xa_footerActions{order:1;flex:none;width:auto;display:flex;align-items:center;gap:6px}";

		function apply(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.textContent = CSS + CSS_EXTRA;
				document.head.appendChild(style);
				return () => style.remove();
			}, "dsh-self-upgrade: css");

			function Panel() {
				const [st, setSt] = useState(null);
				const [busy, setBusy] = useState(false);
				const [msg, setMsg] = useState("");
				const [showVers, setShowVers] = useState(false);
				const [vers, setVers] = useState(null);
				const [open, setOpen] = useState({});

				const refresh = useCallback(async function () {
					try { setSt(await api("/api/dsh-upgrade/status")) } catch (e) { setMsg("状态加载失败: " + e) }
				}, []);
				useEffect(function () { refresh() }, [refresh]);

				const phase = st && st.job ? st.job.phase : "idle";
				const pending = !!(st && st.pendingRestart);
				const running = phase === "running";
				useEffect(function () {
					if (!running && !pending) return;
					return ctx.interval(function () { refresh() }, running ? 2000 : 5000);
				}, [running, pending, refresh]);

				async function callRun(args, label) {
					setBusy(true); setMsg("正在提交：" + label + "…");
					try {
						const r = await api("/api/dsh-upgrade/run", args);
						setMsg(r.started ? ("已开始：" + r.plan + (r.warning ? (" ⚠ " + r.warning) : "")) : ("未启动：" + (r.reason || "未知原因")));
					} catch (e) { setMsg("提交失败: " + e) }
					await refresh(); setBusy(false);
				}
				async function callCancel() {
					setBusy(true);
					try {
						const r = await api("/api/dsh-upgrade/cancel");
						setMsg(!r.wasPending ? "当前无挂起重启" : (r.stopped ? "已取消挂起重启 ✓" : "取消失败，请手动执行: sudo systemctl stop dsh-self-upgrade-restart.timer"));
					} catch (e) { setMsg("取消失败: " + e) }
					await refresh(); setBusy(false);
				}
				async function toggleVers() {
					const next = !showVers;
					setShowVers(next);
					if (next && !vers) {
						setVers("loading");
						try { setVers(await api("/api/dsh-upgrade/versions")) } catch (e) { setVers(null); setMsg("版本列表加载失败: " + e) }
					}
				}
				function toggleNotes(v) {
					setOpen(function (o) { const n = Object.assign({}, o); n[v] = !o[v]; return n });
				}

				const cur = st ? st.installedVersion : "…";
				const lat = st ? st.latestVersion : null;
				const upToDate = !!(st && st.upToDate);
				const res = st && st.job ? st.job.result : null;
				const jobError = st && st.job ? st.job.error : null;
				const stageMap = { preflight: "预检", backup: "备份配置", install: "安装新版本", verify: "校验", compat: "凭据兼容化", restartschedule: "安排重启" };
				const stageKey = (st && st.job && st.job.stage) ? String(st.job.stage).replace(/-/g, "") : "";
				const stageText = stageMap[stageKey] || "准备中";
				const compatText = res && res.compat ? ("；凭据兼容化：" + (res.compat.status === "flattened" ? ("已自动扁平化(" + res.compat.keys + " 键)") : res.compat.status === "already-flat" ? "已是扁平格式" : String(res.compat.status))) : "";

				const rows = [];
				if (vers && vers.versions) {
					vers.versions.forEach(function (v, idx) {
						const isLast = idx === vers.versions.length - 1;
						rows.push(h("div", { className: "dsup-vrow" + (isLast ? " dsup-vrow-last" : ""), key: v.version },
							h("span", { className: "dsup-vname" }, v.version),
							h("span", { className: "dsup-vdate" }, v.date),
							v.version === vers.latest ? h("span", { className: "dsup-tag dsup-tag-new" }, "最新官方") : null,
							v.version === vers.installed ? h("span", { className: "dsup-tag dsup-tag-cur" }, "当前") : null,
							h("span", { className: "dsup-spacer" }),
							v.notes ? h("button", { className: "dsup-btn dsup-btn-sm", onClick: function () { toggleNotes(v.version) } }, open[v.version] ? "收起说明" : "官方说明") : null,
							v.version !== vers.installed ? h("button", {
								className: "dsup-btn dsup-btn-sm", disabled: busy || running,
								onClick: function () { callRun({ version: v.version, restartDelaySec: 5 }, (v.newer ? "安装 " : "回退到 ") + v.version) },
							}, v.newer ? "安装此版本" : "回退到此版本") : null,
						));
						if (v.notes && open[v.version]) {
							rows.push(h("div", { className: "dsup-notes", key: v.version + "-notes", dangerouslySetInnerHTML: { __html: v.notes } }));
						}
					});
				}

				return h("div", { className: "dsup-panel" },
					h("div", { className: "dsup-head" },
						h("span", { className: "dsup-title" },
							"DSH 本体",
							h("span", { className: "dsup-ver" }, cur),
							upToDate ? null : h("span", { className: "dsup-arrow" }, "→"),
							upToDate ? null : h("span", { className: "dsup-latest" }, lat),
						),
						running ? h("span", { className: "dsup-pill dsup-pill-run" }, stageText) :
							phase === "failed" ? h("span", { className: "dsup-pill dsup-pill-fail" }, "任务失败") :
								upToDate ? h("span", { className: "dsup-pill dsup-pill-ok" }, "已是最新官方版") :
									lat ? h("span", { className: "dsup-pill dsup-pill-new" }, "可升级") : null,
					),
					running ? h("div", null,
						h("div", { className: "dsup-bar" }, h("i")),
						h("div", { className: "dsup-stage" }, "正在" + stageText + "…（每 2 秒自动刷新）"),
					) : null,
					pending ? h("div", { className: "dsup-banner dsup-banner-warn" },
						"⏱ 将于 " + ((st.pendingRestart && st.pendingRestart.nextElapse) || "") + " 自动重启服务：当前会话结束、Web UI 闪断数秒。反悔请点下方「取消自动重启」。"
					) : null,
					!running && res && res.action === "upgrade" && res.previous && res.installed ? h("div", { className: "dsup-result" },
						"上次任务：" + res.previous + " → " + res.installed + (res.restartScheduled ? ("，已安排 " + res.restartDelaySec + " 秒后自动重启") : ("；" + (res.restartNote || "未安排重启"))) + compatText
					) : null,
					!running && res && res.action === "none" ? h("div", { className: "dsup-result" }, "上次任务：" + res.reason) : null,
					phase === "failed" && jobError ? h("div", { className: "dsup-banner dsup-banner-err" }, "失败原因：" + jobError) : null,
					h("div", { className: "dsup-actions" },
						h("button", { className: "dsup-btn", disabled: busy, onClick: function () { refresh() } }, "↻ 检查更新"),
						h("button", {
							className: "dsup-btn" + (st && st.autoUpdate ? " dsup-btn-danger" : ""), disabled: busy,
							onClick: async function () {
								setBusy(true);
								try {
									const r = await api("/api/dsh-upgrade/auto", { enabled: !(st && st.autoUpdate) });
									setMsg(r.enabled ? "自动更新已开启：每 30 分钟检查官方版本；发现新版自动安装，待系统空闲后自动重启（不打断进行中的会话）" : "自动更新已关闭");
								} catch (e) { setMsg("切换失败: " + e) }
								await refresh(); setBusy(false);
							},
						}, st && st.autoUpdate ? "⏻ 自动更新：开" : "⏻ 自动更新：关"),
						h("button", {
							className: "dsup-btn dsup-btn-primary", disabled: busy || running || upToDate || !lat,
							onClick: function () { callRun({ restartDelaySec: 5 }, "升级到 " + lat) },
						}, upToDate ? "✓ 已最新" : ("↑ 升级到 " + (lat || "最新官方版"))),
						h("button", { className: "dsup-btn", disabled: busy, onClick: function () { toggleVers() } }, showVers ? "▾ 收起版本历史" : "▸ 版本历史与回退"),
						h("button", {
							className: "dsup-btn dsup-btn-danger", disabled: busy,
							onClick: async function () {
								// window.confirm 在 Web GUI 上下文会被静默禁止，点击无反应；直接走 visible msg 反馈。
								setBusy(true);
								try {
									const r = await api("/api/dsh-upgrade/restart", { delaySec: 5 });
									setMsg(r.scheduled ? "已安排 " + r.delaySec + " 秒后重启服务，Web UI 将短暂中断。" : "未能安排重启：" + (r.reason || r.error || "未知原因"));
								} catch (e) { setMsg("重启失败: " + e) }
								await refresh(); setBusy(false);
							},
						}, "⟳ 立即重启"),
						pending ? h("button", { className: "dsup-btn dsup-btn-danger", disabled: busy, onClick: function () { callCancel() } }, "✕ 取消自动重启") : null,
					),
					showVers ? h("div", { className: "dsup-vers" },
						vers === "loading" ? h("div", { className: "dsup-vrow" }, "加载中…") :
							vers && vers.error ? h("div", { className: "dsup-vrow" }, vers.error) : rows,
					) : null,
					showVers ? h("div", { className: "dsup-meta" },
						"版本历史仅收录官方 GitHub Releases 发布的里程碑；点「官方说明」查看该版更新内容。回退走 备份→重装→校验→兼容化 流程，降级时自动扁平化凭据文件防启动循环。"
					) : null,
					msg ? h("div", { className: "dsup-note" }, msg) : null,
				);
			}

			// 右上角版本徽标：会话头 utilities（Session 日志 右侧）。
			function VersionBadge() {
				const [st, setSt] = useState(null);
				const refresh = useCallback(async function () {
					try { setSt(await api("/api/dsh-upgrade/status")) } catch (e) {}
				}, []);
				useEffect(function () { refresh() }, [refresh]);
				useEffect(function () { return ctx.interval(refresh, 60000) }, [refresh]);
				const cur = st ? st.installedVersion : "";
				const lat = st ? st.latestVersion : null;
				const upToDate = !!(st && st.upToDate);
				return h("span", {
					className: "dsup-ver-badge" + (upToDate ? " dsup-ver-ok" : " dsup-ver-new"),
					title: "DSH 版本 v" + (cur || "…") + (lat && !upToDate ? "（可升级到 " + lat + "）" : ""),
				}, h("span", { className: "dsup-ver-dot" }), cur ? ("v" + cur) : "…");
			}
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "dsup-version",
				order: 100,
			}, () => h(VersionBadge)));

			// 侧边栏底部「设置」旁的重启按钮（footer.action 在设置上方一行）。
			function RestartFooter(props) {
				const wide = !!(props && props.wide);
				const [busy, setBusy] = useState(false);
				const [armed, setArmed] = useState(false);
				const [msg, setMsg] = useState("");
				const [kind, setKind] = useState("");
				function onClick() {
					if (busy) return;
					// window.confirm 在 Web GUI 上下文会被静默禁止（总是返回 false），
					// 导致点按钮毫无反应。改用两步式：第一次点击进入「确认」态并给可见反馈。
					if (!armed) {
						setArmed(true);
						setMsg("再点一次确认重启");
						setKind("");
						setTimeout(function () { setArmed(false); setMsg(""); }, 5000);
						return;
					}
					setArmed(false);
					setBusy(true); setMsg(""); setKind("");
					api("/api/dsh-upgrade/restart", { delaySec: 5 }).then(function (r) {
						const ok = !!(r && r.scheduled);
						setMsg(ok ? "已安排重启 ✓" : (r && (r.reason || r.error)) || "未能重启");
						setKind(ok ? "ok" : "err");
					}).catch(function (e) {
						setMsg("重启失败: " + ((e && e.message) || e));
						setKind("err");
					}).finally(function () {
						setBusy(false);
						setTimeout(function () { setMsg(""); setKind(""); }, 6000);
					});
				}
				const icon = busy
					? h("span", { className: "dsup-foot-icon" }, "…")
					: h("span", { className: "dsup-foot-icon", "aria-hidden": "true" },
						h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
							h("path", { d: "M21 12a9 9 0 1 1-9-9" }),
							h("path", { d: "M21 3v6h-6" })));
				return h("div", { className: "dsup-foot-wrap" },
					h("button", {
						className: "dsup-foot-btn" + (armed ? " dsup-foot-armed" : ""),
						type: "button",
						disabled: busy,
						title: armed ? "再点一次确认重启" : (msg || "立即重启 deepseek-harness 服务"),
						onClick: onClick,
					}, icon, wide ? h("span", null, busy ? "…" : (armed ? "确认重启" : "重启")) : null),
					wide && msg ? h("span", { className: "dsup-foot-msg" + (kind === "err" ? " dsup-foot-msg-err" : kind === "ok" ? " dsup-foot-msg-ok" : "") }, msg) : null,
				);
			}
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsup-restart",
				order: 100,
			}, (owner) => h(RestartFooter, { wide: owner && owner.wide })));

			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "dsup-upgrade",
				order: 90,
				label: () => "DSH 本体升级",
			}, () => h("div", { style: { padding: "16px", maxWidth: "680px" } },
				h(Panel),
			)));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
