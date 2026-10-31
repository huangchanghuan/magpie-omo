#!/usr/bin/env bash
# install.sh — 一键安装 magpie-omo 插件族（每 agent/category 一行）
# 1) 迁移 ~/.omo/omo.jsonc（[opencode]/[native] 分节的 agents/categories → 顶层，自动备份）
# 2) 把 packages/ 下全部插件行加入 magpie
# 可选：node set-plan.mjs <套餐名> 一键整套换挡
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"

command -v node >/dev/null 2>&1 || { echo "需要 node，请先安装"; exit 1; }
NODE=node

echo "== 1/2 迁移 omo.jsonc（分节分配 → 顶层，自动备份）"
"$NODE" migrate-omo-jsonc.mjs

echo "== 2/2 安装插件行（$(ls -d packages/*/ | wc -l) 个）"
for d in packages/*/; do
  magpie plugin add "$HERE/packages/${d#packages/}" 2>&1 | sed "s|^|  |" || true
done

echo
echo "完成。magpie ls 查看 OmO 各行；在 magpie Agents 页逐行选模型。"
echo "一键整套换挡：node set-plan.mjs <plan-balanced|plan-glm|plan-flagship|plan-economy>"
echo "卸载：./uninstall.sh"
