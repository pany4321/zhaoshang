#!/bin/bash
# 招商平台演示就绪检查（方案 C：演示前预启动）
# 用途：一条命令确认「服务活着 + 隧道通 + 数据在 + 登录可用」，失败则自动拉起
# 用法：bash tools/presence_check.sh
# 输出：每一项 ✓ / ✗，末尾给总体结论

APP=/home/pingan/.xiatang/profiles/org21_13701171956/workspace/projects/zhaoshang
PORT=5443
# 域名唯一口径取自 .env（Named Tunnel 固定域名），读不到才回落
DOMAIN=$(grep '^CF_TUNNEL_DOMAIN=' "$APP/server/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r" ' | xargs)
[ -z "$DOMAIN" ] && DOMAIN=zs.195656.xyz

ok=0; fail=0
pass() { echo "  ✓ $1"; ok=$((ok+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }

echo "===== 招商平台演示就绪检查 $(date '+%Y-%m-%d %H:%M:%S') ====="

# 1. 进程
cpid=$(pgrep -x cloudflared | head -1)
npid=$(pgrep -f "node --env-file=.env dist/index.js" | head -1)
[ -n "$npid" ] && pass "Node 服务进程存在 (PID $npid)" || bad "Node 服务进程不存在"
[ -n "$cpid" ] && pass "cloudflared 进程存在 (PID $cpid)" || bad "cloudflared 进程不存在"

# 2. 本地健康
if curl -sf -m 5 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
  pass "本地 /api/health 200"
else
  bad "本地服务不可达"
  echo "  → 尝试自动拉起…"
  ( cd "$APP" && bash restart.sh ) > /tmp/presence_restart.log 2>&1
  if curl -sf -m 8 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    pass "自动拉起成功"
    npid=$(pgrep -f "node --env-file=.env dist/index.js" | head -1)
  else
    bad "自动拉起失败，见 /tmp/presence_restart.log"
  fi
fi

# 3. Named Tunnel（固定域名）：进程 + 活跃连接数 + 域名一致性
#    —— 只做「历史日志里注册过」是不够的：连接可能已全断而日志仍有旧记录。
#       改用 tools/tunnel_check.sh 按 connIndex 归纳当前活跃连接，异常时只重启隧道（不动 node）。
TUN=$(bash "$APP/tools/tunnel_check.sh" --heal 2>/dev/null)
if printf '%s' "$TUN" | grep -q '^tunnel=ok'; then
  pass "Named Tunnel 正常（${TUN#tunnel=ok }）"
elif printf '%s' "$TUN" | grep -q '^tunnel=healed'; then
  pass "Named Tunnel 曾中断，已自动重启恢复（${TUN#tunnel=healed }）"
else
  bad "Named Tunnel 异常：${TUN:-无输出}"
fi

# 4. 公网连通（连续 3 次，容忍一次抖动）
pub_ok=0
for i in 1 2 3; do
  c=$(curl -s -o /dev/null -w "%{http_code}" -m 12 "https://$DOMAIN/api/health" 2>/dev/null)
  [ "$c" = "200" ] && pub_ok=$((pub_ok+1))
done
[ "$pub_ok" -ge 3 ] && pass "公网 /api/health 3/3 通过" || bad "公网仅 $pub_ok/3 通过"

# 5. 首页
c=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://$DOMAIN/" 2>/dev/null)
[ "$c" = "200" ] && pass "公网首页 200" || bad "公网首页 $c"

# 6. 登录 + 数据量
TOKEN=$(curl -s -m 20 -X POST "https://$DOMAIN/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  pass "admin 登录成功"
  stat=$(curl -s -m 60 --compressed "https://$DOMAIN/api/bootstrap" -H "Authorization: Bearer $TOKEN" 2>/dev/null \
    | python3 -c "
import sys,json
d=json.load(sys.stdin); d=d.get('data',d)
e=d.get('enterprises',[])
nofin=sum(1 for x in e if not x.get('finYear'))
recs=sum(len(x.get('records') or []) for x in e)
print(f'{len(e)}|{nofin}|{recs}')
" 2>/dev/null)
  IFS='|' read -r nent nofin nrec <<< "$stat"
  [ "$nent" = "79" ] && pass "企业数据 $nent 家" || bad "企业数异常：$nent（期望 79）"
  [ "$nofin" = "0" ] && pass "全部有真实财务数据" || bad "缺财务数据 $nofin 家"
  echo "  · 企业档案记录 $nrec 条"
else
  bad "admin 登录失败"
fi

# 结论：以「最终实际状态」判定，而不是累加过程中的失败次数
# （自动拉起成功时，前面的失败项已经恢复，不应计入最终结论）
FINAL_OK=1
curl -sf -m 5 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 || FINAL_OK=0
[ "$pub_ok" -ge 3 ] || FINAL_OK=0
[ -n "$TOKEN" ] || FINAL_OK=0
[ "$nent" = "79" ] || FINAL_OK=0

echo "----------------------------------------"
if [ "$FINAL_OK" = "1" ]; then
  echo "✅ 演示就绪：https://$DOMAIN  （admin / admin123）"
  echo "   ⚠ 注意：本环境的容器在每轮对话结束后会被销毁，服务随之停止。"
  echo "      请在拿到这个结果后 1-2 分钟内打开页面开始演示。"
  exit 0
else
  echo "⚠️  存在未恢复的异常项，需处理后再演示"
  exit 1
fi
