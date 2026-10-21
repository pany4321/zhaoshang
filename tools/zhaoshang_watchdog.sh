#!/bin/bash
# 招商平台看门狗
# 背景：容器重建后 node/cloudflared 进程全部消失，容器内无 systemd，
#       pid1 只是 sleep infinity，不会自动拉起业务进程。
# 行为：本地健康检查失败 → 执行 restart.sh（含 Named Tunnel）→ 复查公网
# 输出：健康时静默；恢复成功/失败时输出一行，供 cron 推送给用户

APP=/home/pingan/.xiatang/profiles/org21_13701171956/workspace/projects/zhaoshang
LOG=/home/pingan/.xiatang/profiles/org21_13701171956/workspace/zs_watchdog.log

# 本地已健康 → 静默退出
if curl -sf -m 5 http://127.0.0.1:5443/api/health > /dev/null 2>&1; then
  exit 0
fi

# 服务不可用 → 拉起
{
  echo "==== $(date '+%Y-%m-%d %H:%M:%S') 看门狗触发 ===="
  cd "$APP" || exit 1
  bash restart.sh
} >> "$LOG" 2>&1

# 复查
if curl -sf -m 10 http://127.0.0.1:5443/api/health > /dev/null 2>&1; then
  PUB=$(curl -s -o /dev/null -w "%{http_code}" -m 20 https://zs.195656.xyz/api/health 2>/dev/null)
  echo "招商平台已自动恢复（$(date '+%Y-%m-%d %H:%M')）：本地服务与隧道重新拉起，公网 /api/health = $PUB。地址 https://zs.195656.xyz"
else
  echo "⚠️ 招商平台自动恢复失败（$(date '+%Y-%m-%d %H:%M')），需人工介入。日志：$LOG"
fi
