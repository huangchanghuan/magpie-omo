// set-plan.mjs — CLI 一键切换 OmO 整套模型分配（套餐）
// 用法：node set-plan.mjs <plan-balanced|plan-glm|plan-flagship|plan-economy>
// 原理：文本级替换 ~/.omo/omo.jsonc 顶层 agents/categories 段里各槽位的 model 值，
//       保留全部注释与结构（行状态机按缩进：2=顶层段、4=槽位、6=model）。
//       运行中的 omo 会话需重启后生效。
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const P = "magpie/workbuddy-ai/"
const CODEX = "magpie/codex/gpt-5.6-terra" // hephaestus 只允许 GPT 系
const GEMINI = "magpie/workbuddy-ai/gemini-3.8-flash" // 多模态专属

// 每个套餐 = 命名对象：键 "agents.<key>" / "categories.<key>"，值 = magpie 模型 id。
// hephaestus 固定 codex GPT（omo 的 no-hephaestus-non-gpt 拦截非 GPT）；
// multimodal-looker 固定 Gemini（视觉）；architect/deep-high 用户未配置 → 不写。
const PLANS = {
  // 均衡（= 2026-10 手工调优的基线）
  "plan-balanced": {
    "agents.sisyphus": P + "glm-5.3",
    "agents.sisyphus-junior": P + "deepseek-v4.1-flash",
    "agents.hephaestus": CODEX,
    "agents.atlas": P + "gpt-6.1-sol",
    "agents.prometheus": P + "glm-5.3",
    "agents.metis": P + "glm-5.3",
    "agents.momus": P + "gpt-6.1-sol",
    "agents.oracle": P + "gpt-6-astra",
    "agents.librarian": P + "deepseek-v4.1-flash",
    "agents.explore": P + "glm-5.3-flash",
    "agents.multimodal-looker": GEMINI,
    "agents.plan-consultant": P + "glm-5.3",
    "agents.plan-reviewer": P + "gpt-6.1-sol",
    "categories.artistry": P + "grok-4.7",
    "categories.quick": P + "glm-5.3-flash",
    "categories.ultrabrain": P + "gpt-6-astra",
    "categories.deep-low": P + "gpt-5.6-terra",
    "categories.unspecified-high": P + "glm-5.3",
    "categories.unspecified-low": P + "glm-5.3-flash",
    "categories.visual-engineering": P + "gpt-5.6-terra",
    "categories.writing": P + "gpt-6.1-sol",
  },
  // GLM 全家桶（最省积分；hephaestus 受限走 codex，多模态走 Gemini）
  "plan-glm": {
    "agents.sisyphus": P + "glm-5.3",
    "agents.sisyphus-junior": P + "glm-5.3-flash",
    "agents.hephaestus": CODEX,
    "agents.atlas": P + "glm-5.3",
    "agents.prometheus": P + "glm-5.3",
    "agents.metis": P + "glm-5.3",
    "agents.momus": P + "glm-5.3",
    "agents.oracle": P + "glm-5.3",
    "agents.librarian": P + "glm-5.3-flash",
    "agents.explore": P + "glm-5.3-flash",
    "agents.multimodal-looker": GEMINI,
    "agents.plan-consultant": P + "glm-5.3",
    "agents.plan-reviewer": P + "glm-5.3",
    "categories.artistry": P + "glm-5.3",
    "categories.quick": P + "glm-5.3-flash",
    "categories.ultrabrain": P + "glm-5.3",
    "categories.deep-low": P + "glm-5.3-flash",
    "categories.unspecified-high": P + "glm-5.3",
    "categories.unspecified-low": P + "glm-5.3-flash",
    "categories.visual-engineering": P + "glm-5.3",
    "categories.writing": P + "glm-5.3",
  },
  // 旗舰全开（重档 Astra，轻档 Sol）
  "plan-flagship": {
    "agents.sisyphus": P + "gpt-6-astra",
    "agents.sisyphus-junior": P + "gpt-6.1-sol",
    "agents.hephaestus": CODEX,
    "agents.atlas": P + "gpt-6-astra",
    "agents.prometheus": P + "gpt-6.1-sol",
    "agents.metis": P + "gpt-6.1-sol",
    "agents.momus": P + "gpt-6.1-sol",
    "agents.oracle": P + "gpt-6-astra",
    "agents.librarian": P + "gpt-6.1-sol",
    "agents.explore": P + "gpt-6.1-sol",
    "agents.multimodal-looker": GEMINI,
    "agents.plan-consultant": P + "gpt-6.1-sol",
    "agents.plan-reviewer": P + "gpt-6.1-sol",
    "categories.artistry": P + "grok-4.7",
    "categories.quick": P + "gpt-6.1-sol",
    "categories.ultrabrain": P + "gpt-6-astra",
    "categories.deep-low": P + "gpt-5.6-terra",
    "categories.unspecified-high": P + "gpt-6-astra",
    "categories.unspecified-low": P + "gpt-6.1-sol",
    "categories.visual-engineering": P + "gpt-5.6-terra",
    "categories.writing": P + "gpt-6.1-sol",
  },
  // 经济（DeepSeek-Flash 打天下；hephaestus 走 codex 订阅不烧积分）
  "plan-economy": {
    "agents.sisyphus": P + "deepseek-v4.1-flash",
    "agents.sisyphus-junior": P + "deepseek-v4.1-flash",
    "agents.hephaestus": CODEX,
    "agents.atlas": P + "deepseek-v4.1-flash",
    "agents.prometheus": P + "deepseek-v4.1-flash",
    "agents.metis": P + "deepseek-v4.1-flash",
    "agents.momus": P + "deepseek-v4.1-flash",
    "agents.oracle": P + "deepseek-v4.1-flash",
    "agents.librarian": P + "deepseek-v4.1-flash",
    "agents.explore": P + "deepseek-v4.1-flash",
    "agents.multimodal-looker": GEMINI,
    "agents.plan-consultant": P + "deepseek-v4.1-flash",
    "agents.plan-reviewer": P + "deepseek-v4.1-flash",
    "categories.artistry": P + "deepseek-v4.1-flash",
    "categories.quick": P + "deepseek-v4.1-flash",
    "categories.ultrabrain": P + "deepseek-v4.1-flash",
    "categories.deep-low": P + "deepseek-v4.1-flash",
    "categories.unspecified-high": P + "deepseek-v4.1-flash",
    "categories.unspecified-low": P + "deepseek-v4.1-flash",
    "categories.visual-engineering": P + "deepseek-v4.1-flash",
    "categories.writing": P + "deepseek-v4.1-flash",
  },
}

const plan = process.argv[2]
if (!plan || !PLANS[plan]) {
  console.error("用法：node set-plan.mjs <" + Object.keys(PLANS).join("|") + ">")
  process.exit(1)
}
const target = PLANS[plan]

const file = join(homedir(), ".omo", "omo.jsonc")
if (!existsSync(file)) { console.error("找不到 " + file); process.exit(1) }
const lines = readFileSync(file, "utf8").split("\n")

// 行状态机（按精确缩进长度）：缩进 2 = 顶层键（agents/categories 段），
// 缩进 4 = 段内槽位，缩进 6 = 槽位内 "model"。替换目标槽位的 model 值。
// 槽位是空对象（如 "writing": {}，曾被 magpie 选 default 后清空）时展开为完整对象。
let section = null, slot = null, changed = 0
const healed = []
const out = lines.flatMap((line) => {
  const ind = line.match(/^(\s*)"/)
  if (!ind) return [line]
  const n = ind[1].length
  if (n === 2) {
    const sec = line.match(/^ {2}"(agents|categories)": \{/)
    section = sec ? sec[1] : null
    slot = null
    return [line]
  }
  if (n === 4) {
    const empty = line.match(/^ {4}"([^"]+)": \{\}(,?)$/)
    if (empty && section) {
      const next = target[`${section}.${empty[1]}`]
      if (next) {
        changed++
        healed.push(`${section}.${empty[1]}`)
        return [
          `    "${empty[1]}": {`,
          `      "model": "${next}"`,
          `    }${empty[2]}`,
        ]
      }
    }
    const key = line.match(/^ {4}"([^"]+)": \{/)
    slot = key ? key[1] : null
    return [line]
  }
  if (n === 6 && section && slot && /^ {6}"model":/.test(line)) {
    const next = target[`${section}.${slot}`]
    if (next) {
      changed++
      return [line.replace(/("model": ")[^"]*(")/, `$1${next}$2`)]
    }
  }
  return [line]
})

if (!changed) { console.error("没有写入任何槽位——配置结构可能不是迁移后的顶层布局。"); process.exit(1) }
writeFileSync(file, out.join("\n"))
console.log(`✓ ${plan}：写入 ${changed} 个槽位 → ${file}（运行中的 omo 会话需重启）`)
if (healed.length) console.log(`⚠ 修复了被 magpie"恢复原样"清空的槽位：${healed.join("、")}`)
