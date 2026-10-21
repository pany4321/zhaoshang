#!/usr/bin/env python3
"""冷启动首屏体积核算：解析 index.html 入口 + 引擎 5 批脚本，逐个测 br 传输体积。"""
import re, subprocess

BASE = "http://127.0.0.1:5443"

def dl(path, enc=None):
    """返回实际传输字节数"""
    cmd = ["curl", "-s", "-m", "25", "-o", "/dev/null", "-w", "%{size_download}"]
    if enc:
        cmd += ["-H", f"Accept-Encoding: {enc}"]
    cmd.append(BASE + path)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
    return int(out or 0)

def size(path):
    return dl(path, "br"), dl(path)

html = subprocess.run(["curl", "-s", "-m", "15", BASE + "/"], capture_output=True, text=True).stdout
entry = re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)
entry = [e for e in entry if e.endswith(('.js', '.css'))]

batches = [
    ["/engine/mock.js", "/engine/utils.js", "/engine/state.js"],
    ["/engine/components.js"],
    ["/engine/pages/dashboard.js", "/engine/pages/enterprise.js", "/engine/pages/profile.js",
     "/engine/pages/risk.js", "/engine/pages/graph.js", "/engine/pages/workbench.js",
     "/engine/pages/project.js", "/engine/pages/policy.js", "/engine/pages/aidemo.js"],
    ["/engine/app-core.js"],
]

print("=" * 68)
print(f"{'资源':<40}{'br':>10}{'原始':>10}")
print("=" * 68)
tot_br = tot_raw = 0
for p in entry:
    b, r = size(p)
    tot_br += b; tot_raw += r
    print(f"{p.split('/')[-1]:<40}{b:>10}{r:>10}")

for i, batch in enumerate(batches, 1):
    sub_br = 0
    for p in batch:
        b, r = size(p)
        sub_br += b; tot_br += b; tot_raw += r
    print(f"  [批{i}] {len(batch)} 个脚本（并行）{'':<18}{sub_br:>10}")

BOOTSTRAP = 47201  # 实测 br 后体积
print("=" * 68)
print(f"{'静态小计':<40}{tot_br:>10}{tot_raw:>10}")
print(f"{'/api/bootstrap':<40}{BOOTSTRAP:>10}{350258:>10}")
tot_br += BOOTSTRAP; tot_raw += 350258
print("-" * 68)
print(f"{'首屏合计':<40}{tot_br:>10}{tot_raw:>10}")

rtt, bw = 0.2, 1.5 * 1024 * 1024
est = 4 * rtt + tot_br / bw
print(f"\n公网估算（RTT 200ms × 4 批 + 带宽 1.5MB/s）")
print(f"  · 网络等待  4 × 200ms          = 0.80s")
print(f"  · 数据传输  {tot_br/1024:.0f}KB / 1.5MB/s  = {tot_br/bw:.2f}s")
print(f"  · 预估首屏  ≈ {est:.2f}s")
print(f"  · 压缩率    {(1-tot_br/tot_raw)*100:.0f}%（{tot_raw/1024:.0f}KB → {tot_br/1024:.0f}KB）")
print(f"\n对比优化前：约 2.66MB / 18 次串行请求 → 公网 10s 量级")
