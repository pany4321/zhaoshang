# -*- coding: utf-8 -*-
"""Sync shared engine files from demo/ to web/public/engine/.

demo/ 是唯一设计基准；web/public/engine/ 中"可直拷"的引擎文件必须与 demo
完全一致（本工具用于改完 demo 后一键同步，或用 --check 做一致性校验）。

有意不同步（分化 / 生成物，不在直拷范围）：
  mock.js       由 tools/build_engine_mock.py 锚点式再生（非直拷），本工具会代跑
  app-core.js   源自 demo/assets/js/app.js 的前后端分离改写（路由由 Vue Router 托管）
  vendor/       web 独立的第三方库目录
  注：style.css 平台视觉由 engine/style.css 提供（Vue 壳层只有少量 scoped 样式），已纳入直拷。

用法：
  python tools/sync_engine.py            # 同步（覆盖不一致文件，并再生 mock.js）
  python tools/sync_engine.py --check    # 仅校验；存在差异时退出码 1（可挂验收/CI）
"""
import argparse
import filecmp
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'demo', 'assets')
DST = os.path.join(ROOT, 'web', 'public', 'engine')

PAGES = [
    'dashboard.js', 'enterprise.js', 'profile.js', 'risk.js', 'graph.js',
    'workbench.js', 'project.js', 'policy.js', 'aidemo.js',
]
# (demo/assets 下相对路径, web/public/engine/ 下相对路径)
# style.css：平台视觉全部由 engine style.css 提供（Vue 壳层另有少量 scoped 样式），纳入直拷。
COPY_FILES = [
    ('js/common/utils.js', 'utils.js'),
    ('js/common/state.js', 'state.js'),
    ('js/common/components.js', 'components.js'),
    ('css/style.css', 'style.css'),
] + [('js/pages/' + p, 'pages/' + p) for p in PAGES]


def main():
    ap = argparse.ArgumentParser(description='同步 demo 引擎文件到 web/public/engine')
    ap.add_argument('--check', action='store_true', help='仅校验不写文件，存在差异时退出码 1')
    args = ap.parse_args()

    changed, same = [], []
    missing_src = []
    for src_rel, dst_rel in COPY_FILES:
        s = os.path.join(ASSETS, src_rel.replace('/', os.sep))
        d = os.path.join(DST, dst_rel.replace('/', os.sep))
        if not os.path.exists(s):
            missing_src.append(src_rel)
            continue
        if os.path.exists(d) and filecmp.cmp(s, d, shallow=False):
            same.append(dst_rel)
            continue
        changed.append((dst_rel, s, d))

    if missing_src:
        print('警告：demo 侧文件缺失：' + ', '.join(missing_src))

    if args.check:
        for dst_rel, _, _ in changed:
            print('不一致：' + dst_rel)
        if changed:
            print('\n校验失败：%d 个文件与 demo 不一致。运行 python tools/sync_engine.py 同步。' % len(changed))
            sys.exit(1)
        print('校验通过：%d 个引擎文件与 demo 完全一致。' % len(same))
        return

    for dst_rel, s, d in changed:
        shutil.copyfile(s, d)
        print('已同步 ' + dst_rel)
    if not changed:
        print('全部 %d 个文件已一致，无需同步。' % len(same))

    # mock.js 走锚点式生成器再生（demo mock.js → web/public/engine/mock.js）
    gen = os.path.join(ROOT, 'tools', 'build_engine_mock.py')
    if os.path.exists(gen):
        r = subprocess.run([sys.executable, gen])
        if r.returncode == 0:
            print('已再生 mock.js（build_engine_mock.py）。')
        else:
            print('警告：build_engine_mock.py 退出码 %d，请手动检查 mock.js。' % r.returncode)

    print('\n完成。web/dist 为构建产物，如需更新请执行：cd web && npm run build-only')


if __name__ == '__main__':
    main()
