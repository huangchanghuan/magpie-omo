// generate.mjs — 生成 magpie-omo 插件族（每 agent/category 一行）
// 用法：node generate.mjs  （在 magpie-omo/ 下运行，产出 packages/）
// 日后 omo 出新 agent/category：在 ROWS 里加一行，重跑本脚本 + ./install.sh
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"

const titleCase = (s) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")

// kind: "agents" | "categories" —— omo.jsonc 顶层的两个分配段
const ROWS = [
  // —— OpenCode 版 omo 插件的 agent ——
  { key: "sisyphus", kind: "agents", cn: "主控 agent：全程在线、写码、扛长上下文" },
  { key: "sisyphus-junior", kind: "agents", cn: "执行子 agent：不委派、纯干活" },
  { key: "hephaestus", kind: "agents", cn: "深度自主工作者（omo 只允许 GPT 系）" },
  { key: "atlas", kind: "agents", cn: "总编排：判断力优先、输出短" },
  { key: "prometheus", kind: "agents", cn: "plan 模式写计划：长结构化输出" },
  { key: "metis", kind: "agents", cn: "预规划顾问：澄清模糊需求" },
  { key: "momus", kind: "agents", cn: "计划评审/挑刺：要严格逻辑" },
  { key: "oracle", kind: "agents", cn: "顾问：难题咨询、方案评审" },
  // —— native 版 omo 的 agent ——
  { key: "explore", kind: "agents", cn: "快速探索：找文件、搜代码" },
  { key: "librarian", kind: "agents", cn: "资料检索：文档、外部知识" },
  { key: "multimodal-looker", kind: "agents", cn: "多模态看图：截图、设计稿" },
  { key: "plan-consultant", kind: "agents", cn: "预规划顾问（native）" },
  { key: "plan-reviewer", kind: "agents", cn: "计划评审（native）" },
  // —— categories ——
  { key: "artistry", kind: "categories", cn: "创意/写作类请求" },
  { key: "architect", kind: "categories", cn: "架构设计类请求" },
  { key: "quick", kind: "categories", cn: "快速问答、小任务" },
  { key: "ultrabrain", kind: "categories", cn: "超深思考：难题攻坚" },
  { key: "deep-high", kind: "categories", cn: "深度任务高配档" },
  { key: "deep-low", kind: "categories", cn: "深度任务低配档" },
  { key: "unspecified-high", kind: "categories", cn: "未分类请求·高配兜底" },
  { key: "unspecified-low", kind: "categories", cn: "未分类请求·轻量兜底" },
  { key: "visual-engineering", kind: "categories", cn: "视觉工程：UI、图表" },
  { key: "writing", kind: "categories", cn: "长文写作" },
]

const HARNESS = { agents: "agent", categories: "类别" }

rmSync("packages", { recursive: true, force: true })
for (const row of ROWS) {
  const dir = join("packages", `omo-${row.key}`)
  mkdirSync(dir, { recursive: true })
  const name = `magpie-omo-${row.key}`
  const desc = `Magpie agent row: OmO · ${titleCase(row.key)} — oh-my-openagent ${HARNESS[row.kind]}（${row.cn}）`
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name,
    version: "0.1.0",
    description: desc,
    type: "module",
    magpie: { agent: "./agent.js" },
  }, null, 2) + "\n")
  writeFileSync(join(dir, "agent.js"), `// ${desc}
// 由 generate.mjs 生成；改动请改 ROWS 后重新生成。
export const agent = {
  id: "omo-${row.key}",
  name: "OmO · ${titleCase(row.key)}",
  config: "~/.omo/omo.jsonc",
  model: "${row.kind}.${row.key}.model",
  notice: "写入 ~/.omo/omo.jsonc 顶层；正在运行的 omo 会话需重启后生效。",
}
`)
  console.log("✓", name)
}
console.log(`\n共 ${ROWS.length} 个插件包 → packages/`)
