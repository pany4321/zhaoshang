#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cloudflare Named Tunnel 自动配置（方式 C）

用途：用 API Token 完成「验证 → 取隧道 → 取标准 tunnel token → 配 DNS」全流程，
      避免长字符串在聊天工具中被截断改写的问题（token 由 Cloudflare 服务端生成）。

环境变量：
  CF_API_TOKEN    必填，Cloudflare API Token（Account›Cloudflare Tunnel›Edit + Zone›DNS›Edit）
  CF_ACCOUNT_ID   选填，默认取已解析值
  CF_TUNNEL_ID    选填，默认取已解析值
  CF_DOMAIN       选填，默认 zs.195656.xyz

输出：
  - 每步状态（成功/失败原因）
  - 成功时把 tunnel token 写入 workspace/.cloudflared/tunnel_token（600 权限）
  - 不打印 token 明文
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
TOKEN = (os.environ.get("CF_API_TOKEN") or "").strip()
ACC = (os.environ.get("CF_ACCOUNT_ID") or "3f96afcda891784239e350dd569a862c").strip()
TID = (os.environ.get("CF_TUNNEL_ID") or "2d5b97ba-4b7d-4eca-a9d8-cf4bfbd0774c").strip()
DOMAIN = (os.environ.get("CF_DOMAIN") or "zs.195656.xyz").strip()
ZONE_ROOT = ".".join(DOMAIN.split(".")[-2:])

BASE = "/home/pingan/.xiatang/profiles/org21_13701171956/workspace"
OUT_DIR = os.path.join(BASE, ".cloudflared")


def call(method: str, path: str, body=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"errors": [{"message": "非 JSON 响应"}]}
    except Exception as e:
        return 0, {"errors": [{"message": str(e)}]}


def err_of(d) -> str:
    errs = d.get("errors") or []
    if not errs:
        return "未知错误"
    return "; ".join(f"[{e.get('code')}] {e.get('message')}" for e in errs[:3])


def main() -> int:
    if not TOKEN:
        print("❌ 未提供 CF_API_TOKEN")
        return 1

    # ---------- 1. 验证 Token ----------
    st, d = call("GET", "/user/tokens/verify")
    if st != 200 or not d.get("success"):
        print(f"❌ Token 校验失败（HTTP {st}）：{err_of(d)}")
        print("   常见原因：Token 复制不完整、已过期、或缺少权限")
        return 2
    print(f"✅ Token 有效，状态：{d['result'].get('status')}")

    # ---------- 2. 定位 Zone ----------
    st, d = call("GET", f"/zones?name={ZONE_ROOT}")
    if st != 200 or not d.get("success") or not d.get("result"):
        print(f"❌ 找不到域名 {ZONE_ROOT}（HTTP {st}）：{err_of(d)}")
        print("   可能原因：Token 未包含 Zone:DNS:Edit 权限，或该域名不在此账号下")
        return 3
    zone = d["result"][0]
    zone_id = zone["id"]
    print(f"✅ 域名 {ZONE_ROOT} 已托管（zone_id {zone_id[:12]}…，状态 {zone.get('status')}）")

    # ---------- 3. 查询隧道 ----------
    st, d = call("GET", f"/accounts/{ACC}/cfd_tunnel/{TID}")
    if st != 200 or not d.get("success"):
        print(f"❌ 查不到隧道 {TID}（HTTP {st}）：{err_of(d)}")
        print("   可能原因：Token 未包含 Account:Cloudflare Tunnel:Edit 权限，或隧道已删除")
        return 4
    tun = d["result"]
    print(f"✅ 隧道存在：{tun.get('name')}（状态 {tun.get('status')}，连接数 {len(tun.get('connections') or [])}）")

    # ---------- 4. 获取标准 tunnel token ----------
    st, d = call("GET", f"/accounts/{ACC}/cfd_tunnel/{TID}/token")
    if st != 200 or not d.get("success"):
        print(f"❌ 获取 tunnel token 失败（HTTP {st}）：{err_of(d)}")
        return 5
    tun_token = d["result"]
    print(f"✅ 已取得 tunnel token（长度 {len(tun_token)}，前缀 {tun_token[:8]}…）")

    # ---------- 5. 配置 DNS ----------
    target = f"{TID}.cfargotunnel.com"
    st, d = call("GET", f"/zones/{zone_id}/dns_records?name={DOMAIN}")
    existing = (d.get("result") or []) if d.get("success") else []
    body = {"type": "CNAME", "name": DOMAIN, "content": target, "proxied": True, "ttl": 1, "comment": "zhaoshang platform"}
    if existing:
        rid = existing[0]["id"]
        st, d = call("PATCH", f"/zones/{zone_id}/dns_records/{rid}", body)
        action = "更新"
    else:
        st, d = call("POST", f"/zones/{zone_id}/dns_records", body)
        action = "创建"
    if st not in (200, 201) or not d.get("success"):
        print(f"❌ DNS {action}失败（HTTP {st}）：{err_of(d)}")
        return 6
    print(f"✅ DNS 记录已{action}：{DOMAIN} → {target}（代理开启）")

    # ---------- 6. 保存 token（不打印明文）----------
    os.makedirs(OUT_DIR, exist_ok=True)
    os.chmod(OUT_DIR, 0o700)
    p = os.path.join(OUT_DIR, "tunnel_token")
    with open(p, "w", encoding="utf-8") as f:
        f.write(tun_token)
    os.chmod(p, 0o600)

    # 同时写入 server/.env 供守护与服务读取
    env_path = os.path.join(BASE, "projects/zhaoshang/server/.env")
    if os.path.exists(env_path):
        lines = [l for l in open(env_path, encoding="utf-8").read().splitlines()
                 if not l.startswith("CF_TUNNEL_TOKEN")]
        lines.append("CF_TUNNEL_TOKEN=" + tun_token)
        open(env_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        os.chmod(env_path, 0o600)
        print("✅ tunnel token 已写入 server/.env（600）与 .cloudflared/tunnel_token")

    print("\n下一步：按以下方式启动（脚本不代跑，避免与你当前进程冲突）")
    print(f"  ./bin/cloudflared --logfile {BASE}/cf-named.log tunnel run --token-file {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
