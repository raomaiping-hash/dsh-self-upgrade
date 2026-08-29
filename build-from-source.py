#!/usr/bin/env python3
"""dsh-self-upgrade: 从 GitHub 源码 tag 构建并组装独立部署目录。

用途：官方在 GitHub Releases 发布了版本但 npm registry 尚未同步（如
0.1.2-alpha.1 只在 GitHub 有 tag，npm 上没有包）时，本脚本代替
`npm install -g` 完成"源码构建 → pnpm deploy → 补齐 peer/workspace/第三方
依赖 → 输出可整体替换全局 @deepseek-ai/dsh 的部署目录"。

用法: build-from-source.py <target-version> [--workdir DIR] [--out DIR]
输出: 部署目录路径（stdout 最后一行）
"""

import json
import os
import shutil
import subprocess
import sys
import time

REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness.git'
TAG_PREFIX = 'dsh-v'
PROXY = 'http://127.0.0.1:7890'


def sh(cmd, cwd=None, timeout=3600, env=None):
    e = dict(os.environ)
    e['COREPACK_ENABLE_DOWNLOAD_PROMPT'] = '0'
    if env:
        e.update(env)
    print('  $', cmd, flush=True)
    r = subprocess.run(cmd, shell=True, cwd=cwd, env=e,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       timeout=timeout, text=True)
    tail = (r.stdout or '').strip().splitlines()[-25:]
    for line in tail:
        print('    |', line, flush=True)
    if r.returncode != 0:
        raise RuntimeError(f'命令失败 (exit {r.returncode}): {cmd}')
    return r.stdout


def workspace_packages(root):
    """收集 workspace 内所有 @deepseek-ai/* 包 {name: dir}。"""
    pkgs = {}
    import glob
    for pat in ('packages/*/*/package.json', 'vendor/*/package.json',
                'apps/*/package.json'):
        for f in glob.glob(os.path.join(root, pat)):
            try:
                d = json.load(open(f))
                n = d.get('name')
                if n and n.startswith('@deepseek-ai/') and n != '@deepseek-ai/dsh':
                    pkgs[n] = os.path.dirname(f)
            except Exception:
                pass
    return pkgs


def fill_missing_workspace_pkgs(root, deploy):
    """把 workspace 全部 @deepseek-ai/* 包（构建产物）补进部署目录。"""
    pkgs = workspace_packages(root)
    dep = os.path.join(deploy, 'node_modules', '@deepseek-ai')
    os.makedirs(dep, exist_ok=True)
    have = set(os.listdir(dep))
    SKIP = {'node_modules', 'src', 'tests', 'tsconfig.json',
            'tsconfig.tsbuildinfo', '.gitignore', '.turbo'}
    copied = 0
    for n in sorted(pkgs):
        name = n.split('/')[1]
        if name in have:
            continue
        src = pkgs[n]
        dst = os.path.join(dep, name)
        os.makedirs(dst, exist_ok=True)
        for e in os.listdir(src):
            if e in SKIP:
                continue
            s = os.path.join(src, e)
            if os.path.isdir(s):
                shutil.copytree(s, os.path.join(dst, e), dirs_exist_ok=True)
            else:
                shutil.copy2(s, os.path.join(dst, e))
        copied += 1
    print(f'  补齐 workspace 包: {copied} 个', flush=True)
    return copied


def link_third_party_deps(root, deploy):
    """把主仓库 .pnpm 里全部第三方依赖实体链接/复制进部署目录顶层。

    pnpm deploy 只携带主包闭包，profile bundle 层引用的其他 workspace 包
    的第三方依赖需要补。规则：先找 deploy 自己的 .pnpm 实体，找不到就
    从主仓库 .pnpm 复制实体。scoped 包链接用 ../.pnpm 相对路径。
    """
    top = os.path.join(deploy, 'node_modules')
    pnpm = os.path.join(top, '.pnpm')
    src_pnpm = os.path.join(root, 'node_modules', '.pnpm')
    if not os.path.isdir(src_pnpm):
        print('  警告: 主仓库 .pnpm 不存在，跳过第三方依赖补齐', flush=True)
        return 0

    names = {}
    for ent in os.listdir(src_pnpm):
        base = os.path.join(src_pnpm, ent, 'node_modules')
        if not os.path.isdir(base):
            continue
        for n in os.listdir(base):
            p = os.path.join(base, n)
            if os.path.isdir(p):
                if n.startswith('@'):
                    # scoped: 展开 @scope/* 到具体包
                    for sub in os.listdir(p):
                        sp = os.path.join(p, sub)
                        if os.path.isdir(sp):
                            full = n + '/' + sub
                            names.setdefault(full, os.path.join(ent, 'node_modules', n, sub))
                else:
                    names.setdefault(n, os.path.join(ent, 'node_modules', n))

    # 顶层 @scope 目录若是 symlink（指向 .pnpm 某实体），需先转成实体目录，
    # 否则在它下面补子包会写进该实体。转实体时把原链接目标下的子包一并链接。
    for scope in list(os.listdir(top)):
        if not scope.startswith('@'):
            continue
        scopedir = os.path.join(top, scope)
        if os.path.islink(scopedir):
            real = os.readlink(scopedir)  # 形如 .pnpm/@scope+api@x/node_modules/@scope
            os.unlink(scopedir)
            os.makedirs(scopedir)
            src_scope = os.path.join(top, real)  # top 下解析
            if os.path.isdir(src_scope):
                for sub in os.listdir(src_scope):
                    os.symlink(os.path.join('../', real, sub), os.path.join(scopedir, sub))
            print(f'  scoped 实体化: {scope}', flush=True)

    linked = copied = 0
    for n, rel in sorted(names.items()):
        d = os.path.join(top, n)
        if os.path.exists(d) or os.path.islink(d):
            continue
        local = os.path.join(pnpm, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if os.path.isdir(local):
            # scoped 包在 @scope/ 子目录，需 ../ 前缀
            prefix = '../' if '/' in n else ''
            os.symlink(prefix + os.path.join('.pnpm', rel), d)
            linked += 1
        else:
            src = os.path.join(src_pnpm, rel)
            if os.path.isdir(src):
                shutil.copytree(src, d, dirs_exist_ok=True)
                copied += 1
    print(f'  第三方依赖: 链接 {linked} / 复制 {copied}', flush=True)

    # 修正 scoped 目录下指向 .pnpm/ 的链接（应 ../.pnpm/）
    fixed = 0
    for scope in os.listdir(top):
        if not scope.startswith('@'):
            continue
        sp = os.path.join(top, scope)
        if not os.path.isdir(sp) or os.path.islink(sp):
            continue
        for n in os.listdir(sp):
            p = os.path.join(sp, n)
            if os.path.islink(p):
                t = os.readlink(p)
                if t.startswith('.pnpm/'):
                    os.unlink(p)
                    os.symlink('../' + t, p)
                    fixed += 1
    print(f'  修正 scoped 链接: {fixed} 个', flush=True)
    return linked + copied


def verify_deploy(deploy, target):
    binjs = os.path.join(deploy, 'lib', 'bin.js')
    if not os.path.exists(binjs):
        raise RuntimeError(f'部署目录缺少 lib/bin.js: {deploy}')
    r = subprocess.run(['node', binjs, '--version'],
                       cwd=deploy, capture_output=True, text=True, timeout=60)
    ver = (r.stdout or '').strip()
    if ver != target:
        raise RuntimeError(f'部署版本校验失败: 期望 {target} 实际 {ver}')
    print(f'  校验通过: {ver}', flush=True)
    return ver


def clean_vendor_pollution(src):
    """pnpm deploy 偶尔会把目标目录误落到 workspace 的 vendor/ 下（无
    package.json 的残留），tsdown 的 vendor/* glob 会匹配到它并报 entry
    缺失。构建前按 git 跟踪名单清理 vendor/ 下的多余目录。"""
    vendor = os.path.join(src, 'vendor')
    if not os.path.isdir(vendor):
        return 0
    # git 跟踪的 vendor 成员（tag 内白名单）
    known = set()
    try:
        out = subprocess.run(['git', 'ls-tree', 'HEAD', 'vendor/', '--name-only'],
                             cwd=src, capture_output=True, text=True, timeout=30)
        for line in (out.stdout or '').splitlines():
            name = line.strip().split('/')[-1]
            if name:
                known.add(name)
    except Exception:
        pass
    removed = 0
    for entry in sorted(os.listdir(vendor)):
        p = os.path.join(vendor, entry)
        if entry in known or entry in ('AGENTS.md', 'CLAUDE.md', 'README.md'):
            continue
        if os.path.isdir(p) and not os.path.islink(p):
            shutil.rmtree(p, ignore_errors=True)
            removed += 1
            print(f'  清理 vendor 污染: {entry}', flush=True)
    return removed


def main():
    args = sys.argv[1:]
    target = None
    workdir = None
    out = None
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--workdir' and i + 1 < len(args):
            workdir = args[i + 1]; i += 2
        elif a == '--out' and i + 1 < len(args):
            out = args[i + 1]; i += 2
        else:
            target = a; i += 1
    if not target:
        print('usage: build-from-source.py <version> [--workdir DIR] [--out DIR]', file=sys.stderr)
        sys.exit(2)

    base = workdir or f'/var/tmp/dsh-build-{target}'
    src = os.path.join(base, 'src')
    deploy = out or os.path.join(base, 'deploy')
    os.makedirs(base, exist_ok=True)
    t0 = time.time()

    if not os.path.isdir(os.path.join(src, '.git')):
        sh(f'git clone --depth 1 --branch {TAG_PREFIX}{target} {REPO_URL} {src}',
           timeout=1800)
    else:
        print(f'  复用已有源码目录: {src}', flush=True)

    clean_vendor_pollution(src)

    sh('corepack pnpm install --frozen-lockfile --prefer-offline',
       cwd=src, timeout=3600)
    sh('corepack pnpm run build:lib:host', cwd=src, timeout=3600)
    sh('corepack pnpm run build:lib:client', cwd=src, timeout=3600)
    sh('corepack pnpm run build:web', cwd=src, timeout=3600)

    if os.path.isdir(deploy):
        shutil.rmtree(deploy)
    sh(f'corepack pnpm --filter @deepseek-ai/dsh deploy --legacy {deploy}',
       cwd=src, timeout=3600)
    # pnpm deploy --legacy 会在 workspace 的 vendor/ 下留下同名残留目录
    # （tsdown 的 vendor/* glob 会误匹配它，导致后续构建报 entry 缺失）
    clean_vendor_pollution(src)

    fill_missing_workspace_pkgs(src, deploy)
    link_third_party_deps(src, deploy)
    verify_deploy(deploy, target)

    print(f'完成: {deploy} ({time.time()-t0:.0f}s)', flush=True)
    print(deploy)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'FAILED: {e}', file=sys.stderr)
        sys.exit(1)
