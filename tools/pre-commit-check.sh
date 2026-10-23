#!/bin/bash
# ============================================================
# 提交前敏感信息拦截
# 安装：cp tools/pre-commit-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# 作用：暂存区一旦出现凭据文件、密钥形态内容，直接阻止提交
# 说明：企业真实数据（real-fixtures.json / real-data.js）已获授权公开（2026-10-23），
#       不再拦截；凭据类（.env / 密钥 / 令牌）仍是硬红线。
# ============================================================
set -uo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$STAGED" ] && exit 0

BLOCK=0
fail() { echo "❌ $1"; BLOCK=1; }

# ---------- 1. 文件路径白名单校验 ----------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base=$(basename "$f")

  # 环境变量文件（.env.example 模板除外）
  # 用 .env* 前缀匹配，覆盖 .env / .env.local / .env.prod / .env_xxx 等所有变体
  case "$base" in
    .env.example) continue ;;
    .env*) fail "禁止提交环境变量文件: $f"; continue ;;
  esac

  # 真实企业数据：real-fixtures.json / real-data.js 已获授权公开（2026-10-23），不拦截。
  # 原始取数文件仍拦截——含未加工原始字段，与页面展示所需不是一回事。
  case "$f" in
    data-import/*)                    fail "禁止提交数据导入目录（原始取数文件）: $f"; continue ;;
    *.csv)                            fail "禁止提交 CSV 数据文件（原始取数）: $f"; continue ;;
  esac

  # 编译产物与日志
  case "$f" in
    server/prisma/seed-data.js|server/prisma/seed.js) fail "禁止提交 Prisma 编译产物（含种子口令）: $f"; continue ;;
    *cf.log|server.log|*.log)                          fail "禁止提交运行日志（含地址/令牌）: $f"; continue ;;
  esac
done <<< "$STAGED"

# ---------- 2. 文件内容扫描 ----------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  case "$(basename "$f")" in .env.example) continue ;; esac

  # OpenAI 风格密钥 / JWT 令牌
  if grep -qIaE 'sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.' "$f" 2>/dev/null; then
    fail "文件疑似含真实密钥/令牌: $f"
  fi
  # 真实凭据赋值：只匹配带引号的字面量（如 KEY = "xxxxx"），
  # 避免把 process.env.XXX 这类正常读取代码误判为硬编码
  if grep -qIaE '(LLM_API_KEY|API_KEY|JWT_SECRET|SECRET_KEY|ACCESS_TOKEN)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}["'"'"']' "$f" 2>/dev/null; then
    fail "文件疑似含硬编码凭据字面量: $f"
  fi
done <<< "$STAGED"

if [ "$BLOCK" -ne 0 ]; then
  echo ""
  echo "🚫 提交已阻止。"
  echo "   凭据（大模型接入参数 / MCP 接口参数 / 认证凭据）只允许保存在本地 .env，"
  echo "   该文件已被 .gitignore 排除。企业真实数据已获授权公开，不受此限。"
  exit 1
fi

exit 0
