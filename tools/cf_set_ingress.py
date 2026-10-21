#!/usr/bin/env python3
"""
为已存在的 Named Tunnel 配置 Public Hostname / ingress 规则。
所需环境变量：CF_API_TOKEN
其余信息从 .cloudflared/tunnel_token 解析（base64 JSON: {"a":account,"t":tunnel,"s":secret}）
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

API = "https://api.cloudflare.com/client/v4"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = [
    os.environ.get("CF_TOKEN_FILE", ""),
    os.path.join(ROOT, ".cloudflared", "tunnel_token"),
    os.path.join(os.path.dirname(ROOT), "..", ".cloudflared", "tunnel_token"),
    "/home/pingan/.xiatang/profiles/org21_13701171956/workspace/.cloudflared/tunnel_token",
]
TOKEN_FILE = next((p for p in CANDIDATES if p and os.path.exists(p)), CANDIDATES[1])
HOSTNAME = os.environ.get("CF_HOSTNAME", "zs.195656.xyz")
SERVICE = os.environ.get("CF_SERVICE", "http://localhost:5443")


def api(method, path, body=None, api_token=None):
    url = f"{API}{path}" if path.startswith("/") else path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {api_token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.loads(r.read().decode() or "{}")
            return r.status, payload
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw}
        return e.code, payload


def main():
    api_token = os.environ.get("CF_API_TOKEN", "").strip()
    if not api_token:
        print("缺少 CF_API_TOKEN", file=sys.stderr)
        return 2

    if not os.path.exists(TOKEN_FILE):
        print(f"找不到 {TOKEN_FILE}", file=sys.stderr)
        return 2

    with open(TOKEN_FILE) as f:
        raw = f.read().strip()
    try:
        info = json.loads(base64.b64decode(raw + "=" * (-len(raw) % 4)))
    except Exception as e:
        print(f"tunnel token 解析失败: {e}", file=sys.stderr)
        return 2

    account_id = info.get("a")
    tunnel_id = info.get("t")
    if not account_id or not tunnel_id:
        print("tunnel token 缺少 account 或 tunnel 字段", file=sys.stderr)
        return 2
    print(f"Account: {account_id[:8]}…  Tunnel: {tunnel_id}")

    config = {
        "config": {
            "ingress": [
                {"hostname": HOSTNAME, "service": SERVICE},
                {"service": "http_status:404"},
            ]
        }
    }

    status, payload = api(
        "PUT",
        f"/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations",
        config,
        api_token,
    )
    if status == 200 and payload.get("success"):
        print(f"✅ ingress 已配置：{HOSTNAME} → {SERVICE}")
    else:
        print(f"❌ ingress 配置失败 HTTP {status}")
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:1200])
        return 1

    # 复核
    status, payload = api(
        "GET", f"/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations", None, api_token
    )
    if status == 200 and payload.get("success"):
        ing = (payload.get("result") or {}).get("config", {}).get("ingress", [])
        print("当前 ingress：")
        for row in ing:
            print(f"   - {row.get('hostname') or '*'} → {row.get('service')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
