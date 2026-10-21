#!/bin/bash
# ============================================================
# 招商平台巡检（供 cron 调用）
# 设计原则：一切正常时「无输出」→ cron 不发送任何消息；
#           发现异常才输出，触发告警推送。
# ============================================================
BASE=/home/pingan/.xiatang/profiles/org21_13701171956/workspace
APP=$BASE/projects/zhaoshang
DB=$APP/server/data/demo.db
PORT=5443

ALERTS=""

# ---------- 1. 本地服务 ----------
if ! curl -sf -m 8 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  ALERTS="${ALERTS}❌ 本地服务无响应（端口 $PORT）\n"
fi

# ---------- 2. 公网隧道（Named Tunnel / 固定域名）----------
# 判据：cloudflared 进程 + 活跃连接数(>=1) + https://DOMAIN/api/health = 200
# 异常时由 tunnel_check.sh --heal 只重启隧道（不动后端）
DOMAIN=$(grep '^CF_TUNNEL_DOMAIN=' "$APP/server/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r" ' | xargs)
[ -z "$DOMAIN" ] && DOMAIN=zs.195656.xyz
TUN=$(bash "$APP/tools/tunnel_check.sh" --heal 2>/dev/null)
URL="https://$DOMAIN"

if printf '%s' "$TUN" | grep -q '^tunnel=ok'; then
  :                                   # 隧道正常，静默
elif printf '%s' "$TUN" | grep -q '^tunnel=healed'; then
  ALERTS="${ALERTS}⚠️ 隧道曾中断，已自动重启恢复（${TUN}）\n"
elif printf '%s' "$TUN" | grep -q 'reason=no_binary\|reason=no_token'; then
  ALERTS="${ALERTS}❌ 隧道无法拉起：缺少 cloudflared 二进制或 tunnel token（${TUN}）\n"
elif printf '%s' "$TUN" | grep -q 'reason=conn_down'; then
  ALERTS="${ALERTS}❌ 隧道无活跃连接，自愈后仍不通（查 token 是否失效 / 出站 7844 是否被拦）：${TUN}\n"
elif printf '%s' "$TUN" | grep -q 'reason=proc_down'; then
  ALERTS="${ALERTS}❌ cloudflared 进程不存在且自动拉起失败（${TUN}）\n"
elif [ -n "$TUN" ]; then
  ALERTS="${ALERTS}❌ 公网不可达 $URL —— ${TUN}\n"
else
  ALERTS="${ALERTS}❌ 隧道探测脚本无输出（tools/tunnel_check.sh 异常）\n"
fi

# ---------- 3. 数据同步时效（>36 小时告警）----------
SYNC_INFO=$(python3 - "$DB" <<'PY' 2>/dev/null
import sqlite3, json, sys
from datetime import datetime, timezone
db = sys.argv[1]
try:
    c = sqlite3.connect(db)
    r = c.execute("SELECT value FROM SystemConfig WHERE key='data_sync'").fetchone()
    c.close()
    if not r:
        print("NO_RECORD")
    else:
        d = json.loads(r[0])
        s = d.get('syncedAt', '')
        if not s:
            print("NO_TIME")
        else:
            t = datetime.fromisoformat(s.replace('Z', '+00:00'))
            age = int((datetime.now(timezone.utc) - t).total_seconds() / 3600)
            print(f"{age}|{s[:19]}")
except Exception as e:
    print("ERR")
PY
)

case "$SYNC_INFO" in
  NO_RECORD) ALERTS="${ALERTS}⚠️ 数据库无同步记录（可能未初始化）\n" ;;
  ERR|NO_TIME) ALERTS="${ALERTS}⚠️ 无法读取同步时间\n" ;;
  *)
    AGE="${SYNC_INFO%%|*}"
    WHEN="${SYNC_INFO##*|}"
    if [ "${AGE:-0}" -gt 36 ] 2>/dev/null; then
      ALERTS="${ALERTS}⚠️ 数据已 ${AGE} 小时未同步（上次 $WHEN），请检查每日 02:00 同步任务\n"
    fi
    ;;
esac

# ---------- 4. 磁盘使用率（>92% 告警）----------
USED_PCT=$(df -h "$BASE" | tail -1 | awk '{print $5}' | tr -d '%')
if [ -n "$USED_PCT" ] && [ "$USED_PCT" -gt 92 ] 2>/dev/null; then
  ALERTS="${ALERTS}⚠️ 磁盘使用率 ${USED_PCT}%（workspace 分区）\n"
fi

# ---------- 5. 近 1 小时登录失败激增（>10 次，疑似撞库）----------
FAILS=$(python3 - "$DB" <<'PY' 2>/dev/null
import sqlite3, sys
from datetime import datetime, timedelta, timezone
try:
    c = sqlite3.connect(sys.argv[1])
    rows = c.execute("SELECT createdAt FROM AuditLog WHERE action='login_fail'").fetchall()
    c.close()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    n = 0
    for (s,) in rows:
        try:
            t = datetime.fromisoformat(str(s).replace('Z', '+00:00'))
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            if t > cutoff:
                n += 1
        except Exception:
            pass
    print(n)
except Exception:
    print(-1)
PY
)
if [ -n "$FAILS" ] && [ "$FAILS" -gt 10 ] 2>/dev/null; then
  ALERTS="${ALERTS}🚨 近 1 小时登录失败 ${FAILS} 次，疑似暴力破解，请检查审计日志\n"
fi

# ---------- 输出（无异常时静默）----------
if [ -n "$ALERTS" ]; then
  echo "【招商平台巡检告警】$(date '+%Y-%m-%d %H:%M')"
  echo ""
  echo -e "$ALERTS"
  echo ""
  echo "当前地址：$URL"
  echo "恢复命令：bash $APP/restart.sh"
  echo "隧道单独重启：bash $APP/tools/tunnel_check.sh --heal"
  exit 1
fi

exit 0
