#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 demo/index.html 引用的本地静态资源打版本串（?v=<package.json version>）。

背景（2026-11-04 实测踩坑）：
  demo 的 JS/CSS 文件名不带内容 hash，但 Cloudflare 与浏览器会按上游
  Cache-Control 缓存；历史上 server 的静态头把 /demo/assets/** 误判成
  构建产物给了 1 年 immutable，导致「改了前端代码，演示端看不到」。
  服务端头已修正为 no-cache，但边缘/浏览器里既有的旧缓存仍需靠换 URL 破除。
  因此统一在引用处带 ?v=<version>：每次发版改 package.json version 后再跑本脚本。

用法：
  python tools/stamp_demo_assets.py          # 就地更新
  python tools/stamp_demo_assets.py --check  # 只校验，未打标/版本不一致则退出码 1
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'demo' / 'index.html'
PKG = ROOT / 'package.json'

# 只处理本地相对路径资源（assets/...），跳过外链与已带 hash 的vendor不受影响
PAT = re.compile(r'((?:src|href)=")(assets/[^"?#]+)((?:\?v=[^"#]*)?)(")')


def current_version() -> str:
    return json.loads(PKG.read_text(encoding='utf-8'))['version']


def main() -> int:
    check = '--check' in sys.argv
    ver = current_version()
    html = INDEX.read_text(encoding='utf-8')
    changes = []

    def repl(m):
        prefix, path, old_q, suffix = m.group(1), m.group(2), m.group(3), m.group(4)
        new_q = f'?v={ver}'
        if old_q != new_q:
            changes.append((path, old_q or '(无)', new_q))
        return prefix + path + new_q + suffix

    new_html = PAT.sub(repl, html)

    if check:
        if changes:
            print(f'[stamp --check] {len(changes)} 处资源版本串不是 {ver}：')
            for p, o, n in changes[:10]:
                print(f'  {p}: {o} -> {n}')
            return 1
        print(f'[stamp --check] 全部资源已打标 {ver}')
        return 0

    if not changes:
        print(f'无变更（已全部为 {ver}）')
        return 0
    INDEX.write_text(new_html, encoding='utf-8')
    print(f'已更新 {len(changes)} 处资源版本串 → {ver}')
    for p, o, n in changes[:12]:
        print(f'  {p}: {o} -> {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
