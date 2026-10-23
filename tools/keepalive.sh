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

# 健康 → 只回 ok（一行，最省 token）
if curl -sf -m 5 http://127.0.0.1:5443/api/health > /dev/null 2>&1; then
  echo ok
  exit 0
fi

# 不健康 → 自愈
TS=$(date '+%Y-%m-%d %H:%M:%S')
( cd "$APP" && bash restart.sh ) > /tmp/keepalive_restart.log 2>&1

if curl -sf -m 8 http://127.0.0.1:5443/api/health > /dev/null 2>&1; then
  PUB=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://$DOMAIN/api/health" 2>/dev/null)
  echo "$TS 服务中断 → 已自动拉起（公网 /api/health=$PUB）" >> "$LOG"
  echo "recovered: 服务曾中断，已自动拉起，公网 $PUB"
else
  echo "$TS 服务中断 → 自动拉起失败，需人工介入" >> "$LOG"
  echo "fail: 自动拉起失败，需人工介入"
fi
