#!/bin/bash
# ============================================================
# Named Tunnel 健康探测 / 自愈（供 health_check.sh、presence_check.sh 共用）
#
# 背景：已从 trycloudflare 临时隧道切换为 Named Tunnel（固定域名，token-file 启动）。
#       旧的「grep cf.log 抓 trycloudflare.com」判据全部失效。
#
# 判据（三条同时满足才算通）：
#   1. cloudflared 进程存在
#   2. 日志中按 connIndex 归纳的活跃连接数 >= 1
#      （每个 connIndex 只看它最后一条数据面事件是 Registered 还是 terminated，
#        避免「历史上注册过但现在全断」以及「4 条连接里断 1 条」的误判）
#   3. 公网 https://$DOMAIN/api/health 返回 200
#
# 用法：
#   bash tunnel_check.sh            # 只探测，输出一行 key=value，0=健康 1=异常
#   bash tunnel_check.sh --heal     # 探测 + 异常时只重启隧道（不动 node 服务）
# ============================================================

BASE=/home/pingan/.xiatang/profiles/org21_13701171956/workspace
APP=$BASE/projects/zhaoshang
NAMED_LOG=$BASE/cf-named.log
TOKEN_FILE=$BASE/.cloudflared/tunnel_token
ENVF=$APP/server/.env
CFD=$BASE/bin/cloudflared

HEAL=0
[ "$1" = "--heal" ] && HEAL=1

# 域名从 .env 读（唯一口径），读不到才回落
DOMAIN=$(grep '^CF_TUNNEL_DOMAIN=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r" ' | xargs)
[ -z "$DOMAIN" ] && DOMAIN=zs.195656.xyz

# ---------- 1. 进程 ----------
cpid() { pgrep -x cloudflared | head -1; }

# ---------- 2. 活跃连接数（按 connIndex 归纳最后状态） ----------
active_conn() {
  python3 - "$NAMED_LOG" <<'PY' 2>/dev/null
import json, sys
path = sys.argv[1]
state = {}
DOWN = {'Connection terminated', 'Unregistering connection',
        'Serve tunnel error', 'lost connection to edge'}
try:
    with open(path, errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith('{'):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            m = d.get('message', '')
            ci = d.get('connIndex')
            if ci is None:
                continue
            if m == 'Registered tunnel connection':
                state[ci] = 'up'
            elif m in DOWN:
                state[ci] = 'down'
    up = sum(1 for v in state.values() if v == 'up')
    print(f"{up}/{len(state)}" if state else "0/0")
except Exception:
    print("0/0")
PY
}

# ---------- 3. 公网探测 ----------
pub_code() { curl -s -o /dev/null -w "%{http_code}" -m 12 "https://$DOMAIN/api/health" 2>/dev/null; }

CPID=$(cpid)
CONN=$(active_conn)
PUB=$(pub_code)

healthy() { [ -n "$CPID" ] && [ "${CONN%%/*}" -ge 1 ] 2>/dev/null && [ "$PUB" = "200" ]; }

if healthy; then
  echo "tunnel=ok proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
  exit 0
fi

# 异常：按类型输出，便于调用方给出精准告警文案
reason=""
[ -z "$CPID" ] && reason="proc_down"
[ -z "$reason" ] && [ "${CONN%%/*}" = "0" ] && reason="conn_down"
[ -z "$reason" ] && [ "$PUB" != "200" ] && reason="public_$PUB"
[ -z "$reason" ] && reason="unknown"

if [ "$HEAL" != "1" ]; then
  echo "tunnel=fail reason=$reason proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
  exit 1
fi

# ---------- 自愈：只重启隧道，不动后端 ----------
if [ ! -x "$CFD" ]; then
  echo "tunnel=fail reason=no_binary proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
  exit 1
fi
if [ ! -f "$TOKEN_FILE" ]; then
  echo "tunnel=fail reason=no_token proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
  exit 1
fi

for pid in $(pgrep -x cloudflared 2>/dev/null); do
  kill -TERM "$pid" 2>/dev/null
done
sleep 3
for pid in $(pgrep -x cloudflared 2>/dev/null); do
  kill -KILL "$pid" 2>/dev/null   # 顽固残留会占住连接，必须收干净
done

# 追加分隔标记，不清空日志（保留历史，活跃连接归纳会自动以新注册覆盖）
echo "{\"level\":\"info\",\"time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"message\":\"=== heal restart by tunnel_check.sh ===\"}" >> "$NAMED_LOG"
cd "$BASE" || exit 1
nohup "$CFD" tunnel --no-autoupdate --logfile "$NAMED_LOG" run --token-file "$TOKEN_FILE" > /dev/null 2>&1 &

for i in $(seq 1 30); do
  sleep 1
  CPID=$(cpid)
  CONN=$(active_conn)
  [ -n "$CPID" ] && [ "${CONN%%/*}" -ge 1 ] 2>/dev/null && break
done

for i in $(seq 1 15); do
  PUB=$(pub_code)
  [ "$PUB" = "200" ] && break
  sleep 2
done

CPID=$(cpid); CONN=$(active_conn); PUB=$(pub_code)
if healthy; then
  echo "tunnel=healed proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
  exit 0
fi
echo "tunnel=fail reason=heal_failed_$reason proc=${CPID:-none} conn=$CONN pub=$PUB domain=$DOMAIN"
exit 1
