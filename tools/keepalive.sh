#!/bin/bash
# 保活 + 自愈（cron 每 4 分钟调用）
#
# 设计目标：
#   1. 保活  —— 产生一次容器活动，避免空闲被平台回收
#   2. 自愈  —— 服务若已挂，执行 restart.sh 重新拉起
#   3. 静默  —— 正常只输出 "ok"，把 cron 的 token 开销压到最低
#
# 异常事件写入 keepalive_events.log，供下次对话时主动汇报（不靠 cron 推送）

APP=/home/pingan/.xiatang/profiles/org21_13701171956/workspace/projects/zhaoshang
LOG=/home/pingan/.xiatang/profiles/org21_13701171956/workspace/keepalive_events.log
DOMAIN=zs.195656.xyz
WS=/home/pingan/.xiatang/profiles/org21_13701171956/workspace

# ── 磁盘 offload 自愈（每轮静默执行，不影响输出）────────────────────────
# /root 在 overlay 可写层（200G 共享盘，容器重建即丢），npm / pip / 浏览器缓存
# 会持续往里写。把它们软链到 workspace 持久卷（3TB）上，减少对 overlay 的增量。
# 容器重建后 /root 会被重建为普通目录（软链丢失），这里每 4 分钟补回一次。
# 注意：/tmp 满时 runc 无法创建进程，terminal 会彻底不可用 —— 所以顺带清过期临时文件。
offload_link() {
  local target="$1" dest="$2"
  mkdir -p "$dest" 2>/dev/null
  if [ -L "$target" ]; then
    [ "$(readlink "$target" 2>/dev/null)" = "$dest" ] || { rm -f "$target"; ln -sfn "$dest" "$target"; }
  elif [ -d "$target" ]; then
    cp -a "$target/." "$dest/" 2>/dev/null
    rm -rf "$target" && ln -sfn "$dest" "$target"
  else
    ln -sfn "$dest" "$target"
  fi
}
offload_link /root/.cache "$WS/.offload/cache"
offload_link /root/.npm   "$WS/.offload/npm"
# 只清 1 天前的临时文件，避免误删正在写的 runc / 浏览器文件
find /tmp -maxdepth 1 -mtime +1 -exec rm -rf {} + 2>/dev/null || true

# ── DIY 站点（zs.diy.xiatang.com.cn）：必须在应用就绪之后调用 ────────
# site-watchdog 的判据是「端口通就必须有隧道」。若在应用起来之前跑，
# 它建不成隧道，手动只跑一轮就会漏掉 diy 域名 —— 故封装成函数，由下方
# 「应用健康」和「应用刚被拉起」两个时点分别调用。
diy_watchdog() {
  if [ -x "$WS/site-watchdog.sh" ]; then
    bash "$WS/site-watchdog.sh" --quiet >/dev/null 2>&1
  elif [ -d "$WS/published-sites" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ⚠ site-watchdog.sh 缺失，DIY 站点无自愈保护" >> "$LOG"
  fi
}

# ── 健康判定：本地服务 + 隧道进程 + 公网可达（三层，缺一即自愈）──────
# 旧版只判 127.0.0.1:5443，cloudflared 单独挂掉时会误判「健康」，
# 表现为「本地一切正常、公网 502 无人管」。故补 tunnel / 公网两层。
HEALTH_URL=http://127.0.0.1:5443/api/health
TOKEN_FILE="$WS/.cloudflared/tunnel_token"
CF_BIN="$WS/bin/cloudflared"
CF_LOG="$WS/cf-named.log"
PUB_CODE=""

local_ok()   { curl -sf -m 5 "$HEALTH_URL" >/dev/null 2>&1; }
cf_proc_ok() { pgrep -x cloudflared >/dev/null 2>&1; }

# 公网探测：失败重试一次，降低单次网络抖动导致的误重启
pub_ok() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$DOMAIN/" 2>/dev/null)
  if [ "$code" != "200" ]; then
    sleep 2
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$DOMAIN/" 2>/dev/null)
  fi
  PUB_CODE=$code
  [ "$code" = "200" ]
}

# 只重启隧道，不动 server —— 避免「隧道小故障」演变成全站闪断
start_tunnel_only() {
  local pid
  if [ ! -f "$TOKEN_FILE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ⚠ token 文件缺失（$TOKEN_FILE），跳过隧道自愈" >> "$LOG"
    return 1
  fi
  for pid in $(pgrep -x cloudflared 2>/dev/null); do kill -TERM "$pid" 2>/dev/null; done
  sleep 1
  ( cd "$WS" && setsid "$CF_BIN" tunnel --no-autoupdate --logfile "$CF_LOG" \
      run --token-file "$TOKEN_FILE" >/dev/null 2>&1 & )
}

TS=$(date '+%Y-%m-%d %H:%M:%S')

# DIY 站点是否真通（用 watchdog 自己的探活，覆盖 runner + 隧道 + 公网）
diy_ok() { bash "$WS/site-watchdog.sh" --status >/dev/null 2>&1; }

# ① DIY 站点层（runner + zs.diy 隧道）：必须在应用之前执行！
#    🔴 实测坑（2026-11-07 22:39 踩到）：runner 启动时要先起占位进程、
#    再等 local 端口。若应用已经把 5443 占了，它判定 "port already in use"
#    并进入 5s/10s/15s/20s 无限退避，**永不建隧道**，日志在 site-runner.log。
#    因此顺序固定为：runner（端口空时占位）→ 应用 → runner 自动建隧道。
diy_watchdog

# ② 应用层：node 已交回 runner 托管（zs.yaml 的 command），由 runner 负责重启。
#    这里只等待它恢复，绝不自己起 node —— 否则抢 5443 会让 runner 判定
#    "port already in use" 并无限退避（实测踩过）。
if ! local_ok; then
  echo "$TS 本地服务不健康 → 等 runner 自动拉起（应用已交 runner 托管）" >> "$LOG"
  for i in 1 2 3 4 5 6 7 8; do
    sleep 5
    local_ok && break
  done
  if local_ok; then
    echo "$TS 应用已由 runner 拉起" >> "$LOG"
  else
    echo "$TS 应用未恢复，需人工（检查 runner：pgrep -af xiatang-site-runner）" >> "$LOG"
  fi
fi

# ③ Cloudflare named tunnel 层 + DIY 站点层：都通了才回 ok（不给假绿灯）
if local_ok; then
  if cf_proc_ok && pub_ok && diy_ok; then
    echo ok
    exit 0
  fi
  if ! cf_proc_ok || ! pub_ok; then
    WHY="隧道进程缺失"
    cf_proc_ok && WHY="公网不可达(HTTP ${PUB_CODE:-000})"
    echo "$TS 本地正常但$WHY → 重启隧道" >> "$LOG"
    start_tunnel_only
    sleep 10
    if pub_ok; then
      echo "$TS 隧道已自动拉起（公网 200）" >> "$LOG"
      echo "recovered: 隧道曾中断（$WHY），已自动拉起"
    else
      echo "$TS 隧道拉起失败（公网 ${PUB_CODE:-000}），需人工" >> "$LOG"
      echo "fail: 隧道自动拉起失败，需人工介入"
    fi
    exit 0
  fi
  # CF 隧道正常、只有 diy 域名不通（典型：runner 处于退避窗口）
  echo "$TS 应用与 CF 隧道正常，但 zs.diy 未恢复（runner 可能退避中）" >> "$LOG"
  echo "warn: zs.diy 未恢复，需手动清退避后重试：rm -f $WS/published-sites/.ctl/last-restart"
  exit 0
fi

echo "$TS 服务未恢复，需人工介入" >> "$LOG"
echo "fail: 服务未恢复，需人工介入（tail /tmp/keepalive_restart.log）"
