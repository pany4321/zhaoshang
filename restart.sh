#!/bin/bash
# 招商企业服务与智慧监管平台 —— 单体版启动脚本
# 形态：单进程（Fastify 同时托管前端静态资源与 /api），端口 5443
# 隧道：Named Tunnel（固定域名 zs.195656.xyz，token-file 启动）；无 token 直接报错，不再回退 trycloudflare
# 用法：bash restart.sh

BASE=/home/pingan/.xiatang/profiles/org21_13701171956/workspace
APP=$BASE/projects/zhaoshang
PORT=5443
TOKEN_FILE=$BASE/.cloudflared/tunnel_token
NAMED_LOG=$BASE/cf-named.log

echo "== 停止旧 cloudflared =="
# 应用（node :5443）已交回 xiatang-site-runner 托管（published-sites/zs.yaml 的 command），
# 本脚本不再启停 node —— 否则会与 runner 抢 5443，触发 port already in use 退避。
for pid in $(pgrep -x cloudflared 2>/dev/null); do
  kill -TERM "$pid" 2>/dev/null && echo "  已停止 cloudflared PID $pid"
done
sleep 2

echo "== 等待 runner 托管的应用就绪（端口 $PORT）=="
for i in $(seq 1 30); do
  if curl -sf -m 2 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    echo "  ✅ 应用就绪（runner 托管）http://127.0.0.1:$PORT"
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "  ⚠ 应用未就绪。检查 runner：pgrep -af xiatang-site-runner"
    echo "    若 runner 不在，不要在本脚本起 node，改用：bash $BASE/keepalive.sh"
  fi
done

# ---------- 隧道 ----------
cd "$BASE" || exit 1

if [ -f "$TOKEN_FILE" ] && grep -q '^CF_TUNNEL_DOMAIN=' "$APP/server/.env" 2>/dev/null; then
  DOMAIN=$(grep '^CF_TUNNEL_DOMAIN=' "$APP/server/.env" | head -1 | cut -d= -f2- | tr -d '\r"' | xargs)
  echo "== 启动 Named Tunnel（固定域名 $DOMAIN）=="
  : > "$NAMED_LOG"
  nohup ./bin/cloudflared tunnel --no-autoupdate --logfile "$NAMED_LOG" run --token-file "$TOKEN_FILE" > /dev/null 2>&1 &
  echo "  cloudflared PID $!"

  for i in $(seq 1 30); do
    sleep 1
    if grep -q "Registered tunnel connection" "$NAMED_LOG" 2>/dev/null; then
      echo "  ✅ 隧道已注册"
      break
    fi
    [ "$i" -eq 30 ] && { echo "  ⚠ 隧道未注册，见 $NAMED_LOG"; }
  done

  for i in $(seq 1 15); do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "https://$DOMAIN/api/health" 2>/dev/null)
    if [ "$code" = "200" ]; then
      echo "  ✅ 公网验证通过（HTTP 200）"
      echo ""
      echo "  公网地址：https://$DOMAIN"
      exit 0
    fi
    sleep 2
  done
  echo "  ⚠ 公网返回 $code，本地服务正常，请检查 Cloudflare ingress 配置"
  exit 1
fi

echo "== 未找到 tunnel token，Named Tunnel 无法启动 =="
echo "  token 期望路径：$TOKEN_FILE"
echo "  已废弃 trycloudflare 回退（地址不固定，不可用于演示）"
echo "  人工处理：恢复 .cloudflared/tunnel_token 后重跑 bash $APP/restart.sh"
exit 1
