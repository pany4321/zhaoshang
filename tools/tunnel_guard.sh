#!/bin/bash
# ============================================================
# 招商平台 守护脚本（应用进程 + Named Tunnel 固定域名）
#
# 【已迁移】隧道不再是 trycloudflare 临时隧道：
#   - 隧道探测/自愈统一委托 tools/tunnel_check.sh（token-file 启动 Named Tunnel）
#   - 域名固定为 .env 的 CF_TUNNEL_DOMAIN，不再需要 current_url.txt / cf.log
#
# 职责：
#   1. 容器重启自启 —— node 与 cloudflared 都不存在时自动拉起
#   2. 静默自愈 —— 一切正常时不输出（配合 cron no_agent 不推送）
#   3. 恢复/失败才输出报告
#
# 用法：bash tools/tunnel_guard.sh
# ============================================================

BASE=/home/pingan/.xiatang/profiles/org21_13701171956/workspace
APP=$BASE/projects/zhaoshang
PORT=5443
ENVF=$APP/server/.env

DOMAIN=$(grep '^CF_TUNNEL_DOMAIN=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r" ' | xargs)
[ -z "$DOMAIN" ] && DOMAIN=zs.195656.xyz
URL="https://$DOMAIN"

local_ok() { curl -sf -m 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; }

# ---------- 1. 应用进程 ----------
if ! local_ok; then
  ( cd "$APP" && bash restart.sh ) > /tmp/tunnel_guard_restart.log 2>&1
  if local_ok; then
    PUB=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL/api/health" 2>/dev/null)
    echo "🔧 应用服务曾中断，已自动拉起（含 Named Tunnel），公网 $URL → $PUB"
    [ "$PUB" = "200" ] && exit 0
  else
    echo "❌ 招商平台启动失败（端口 $PORT）"
    echo "   人工处理：bash $APP/restart.sh"
    tail -5 /tmp/tunnel_guard_restart.log 2>/dev/null | sed 's/^/   /'
    exit 0
  fi
fi

# ---------- 2. Named Tunnel ----------
TUN=$(bash "$APP/tools/tunnel_check.sh" --heal 2>/dev/null)
if printf '%s' "$TUN" | grep -q '^tunnel=ok'; then
  exit 0                                  # 一切正常，静默
elif printf '%s' "$TUN" | grep -q '^tunnel=healed'; then
  echo "🔄 Named Tunnel 曾中断，已自动重启恢复"
  echo "   地址：$URL（${TUN}）"
  exit 0
fi

echo "❌ 招商平台隧道异常：${TUN:-探测脚本无输出}"
echo "   地址：$URL"
echo "   人工处理：bash $APP/tools/tunnel_check.sh --heal"
echo "             bash $APP/restart.sh"
exit 0
