// dsh-self-upgrade 契约自检：npm/bundle manifest、entry/client 契约、patch 行、密钥扫描。
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, cond, extra = "") => {
  console.log((cond ? "PASS" : "FAIL") + "  " + label + (cond ? "" : "  <<< " + extra));
  if (!cond) failures += 1;
};

// 1. package.json 契约
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
check("name is dsh-self-upgrade", pkg.name === "dsh-self-upgrade");
check("type module", pkg.type === "module");
check("main points at entry", pkg.main === "./index.js" || pkg.main === "index.js");
check("exports . / ./client / patch", !!(pkg.exports && pkg.exports["."] && pkg.exports["./client"] && pkg.exports["./cordis.patch.yml"]));
check("dsh.bundle.patch declared", pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === "./cordis.patch.yml");
check("dsh.client platform web", pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === "web");
check("files list covers published set", Array.isArray(pkg.files) && ["index.js", "client.js", "cordis.patch.yml"].every((f) => pkg.files.includes(f)));

// 2. entry 契约（静态解析，不执行 apply）
const indexSrc = readFileSync(join(root, "index.js"), "utf8");
check("entry exports name", /export const name\s*=\s*["']dsh-self-upgrade["']/.test(indexSrc));
check("entry exports inject incl. timer+jobs", /export const inject\s*=\s*\[[^\]]*"timer"[^\]]*"jobs"[^\]]*\]/.test(indexSrc));
check("entry exports apply", /export function apply\s*\(/.test(indexSrc));
check("panel routes loopback-guarded", indexSrc.includes("isLoopbackHost") && indexSrc.includes("/api/dsh-upgrade/restart"));

// 3. client 契约
const clientSrc = readFileSync(join(root, "client.js"), "utf8");
check("client registers via __ModuleLoader__.load", clientSrc.includes("__ModuleLoader__.load"));
check("client id matches package", clientSrc.includes('"dsh-self-upgrade"'));

// 4. patch 行
const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
check("patch inserts the plugin row", /-\s*insert:/.test(patch) && patch.includes("dsh-self-upgrade"));

// 5. 密钥扫描（发布文件不得嵌入凭据）
const secretRe = /(password|passwd|secret|api[_-]?key|token|bearer)\s*[:=]\s*["'][^"'\n]{8,}/i;
const offenders = [];
for (const f of [...pkg.files, "package.json"]) {
  const text = readFileSync(join(root, f), "utf8");
  for (const line of text.split("\n")) if (secretRe.test(line)) offenders.push(f + ": " + line.trim().slice(0, 80));
}
check("no embedded secrets in published files", offenders.length === 0, offenders.join(" | "));

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
