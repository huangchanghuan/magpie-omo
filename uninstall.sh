#!/usr/bin/env bash
# uninstall.sh — 移除 magpie-omo 插件（行 + 套餐 provider）
# omo.jsonc 不会自动还原：如需回到迁移前状态，
# 把备份 ~/.omo/omo.jsonc.bak.magpie-omo-* 拷回去。
set -uo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"

# 1) 移除插件包（plugin rm 认添加时的路径，不认 name）
if [ -f "$HERE/agent.js" ]; then
  magpie plugin rm "$HERE" 2>&1 | sed "s|^|  |"
fi
if [ -d "$HERE/packages" ]; then
  for d in "$HERE"/packages/*/; do
    [ -d "$d" ] || continue
    magpie plugin rm "${d%/}" 2>&1 | sed "s|^|  |"
  done
fi

# 2) 移除套餐 provider（若存在）
magpie provider rm omo-plan 2>&1 | sed "s|^|  |"

echo
echo "插件已移除。omo.jsonc 未改动；如需还原迁移前的分节结构，请用备份文件。"
ls ~/.omo/omo.jsonc.bak.magpie-omo-* 2>/dev/null || echo "（未找到迁移备份）"
