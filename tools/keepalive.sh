#!/bin/bash
# 保活 + 自愈（cron 每 4 分钟调用）
#
# ⚠️ 2026-10-21 已迁移：cron 现在调用的是 workspace/keepalive.sh（本文件的副本）。
#    迁移原因：AGENTS.md 的子目录注入由 terminal 命令文本里的路径触发，
#    命令若写成 .../projects/zhaoshang/tools/keepalive.sh，每轮会被注入 11KB 的
#    AGENTS.md 正文（26.8KB/次 → 13.7KB/次）。所以 cron 侧改指向 workspace 根目录下的副本。
#    改本文件后请同步：cp projects/zhaoshang/tools/keepalive.sh ../../keepalive.sh
#    真正生效的是 workspace/keepalive.sh。
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
