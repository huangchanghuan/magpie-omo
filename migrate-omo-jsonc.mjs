#!/usr/bin/env node
// migrate-omo-jsonc.mjs — 把 ~/.omo/omo.jsonc 的 [opencode]/[native] 分节中的
// agents/categories 迁移到顶层（harness 中立配置），使 magpie-omo 插件族的
// 顶层写入成为唯一分配源。
//
// 背景：omo 的优先级是 分节 > 顶层；分节不清掉，magpie 写的顶层值会被无视。
// 规则：
//   - 同名键两节都有且值不同 → 取 [opencode]，打印警告
//   - 已有顶层同名键 → 分节值覆盖（分节才是当前实际生效值），打印警告
//   - 文本级手术：其余注释原样保留；被移走条目内的注释会丢失
//   - 写入前自动备份；写完重新解析校验，失败不落盘
//
// 用法：node migrate-omo-jsonc.mjs [omo.jsonc 路径]
import { readFileSync, writeFileSync, copyFileSync } from "node:fs"
import { homedir } from "node:os"

const SECTIONS = ["[opencode]", "[native]"]
const MOVE_KEYS = ["agents", "categories"]

const file = process.argv[2] || `${homedir()}/.omo/omo.jsonc`
const src = readFileSync(file, "utf8")

// ---------- 基础工具 ----------

// 跳过空白与注释，返回下一个实质字符的索引
function skipWsComments(text, i, to = text.length) {
  for (;;) {
    while (i < to && /\s/.test(text[i])) i++
    if (text[i] === "/" && text[i + 1] === "/") { while (i < to && text[i] !== "\n") i++; continue }
    if (text[i] === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e === -1 ? to : e + 2; continue }
    return i
  }
}

// 从字符串字面量中解出值（无转义时零拷贝语义，这里只处理常见转义）
function unquote(text, start, end) {
  const raw = text.slice(start + 1, end - 1)
  return raw.includes("\\") ? JSON.parse(text.slice(start, end)) : raw
}

// 逐段扫描：字符串 / 注释 / 单字符；[from, to) 区间内
function* scan(text, from, to) {
  let i = from
  while (i < to) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < to) {
        if (text[j] === "\\") { j += 2; continue }
        if (text[j] === '"') { j++; break }
        j++
      }
      yield { type: "string", start: i, end: j }
      i = j
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      let j = i
      while (j < to && text[j] !== "\n") j++
      yield { type: "comment", start: i, end: j }
      i = j
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2)
      const j = e === -1 ? to : e + 2
      yield { type: "comment", start: i, end: j }
      i = j
      continue
    }
    yield { type: "char", start: i, end: i + 1, ch: c }
    i++
  }
}

// 在 [from, to) 内找 depth 层（相对扫描起点的嵌套深度）名为 key 的属性。
// 返回 { keyStart, cutStart(含缩进与上方注释行), valueStart, valueEnd, commaAfter } 或 null
function findProperty(text, key, depth, from = 0, to = text.length) {
  let d = 0
  for (const t of scan(text, from, to)) {
    if (t.type === "char") {
      if (t.ch === "{" || t.ch === "[") d++
      else if (t.ch === "}" || t.ch === "]") d--
      continue
    }
    if (t.type !== "string" || d !== depth) continue
    const k = skipWsComments(text, t.end, to)
    if (text[k] !== ":") continue // 值字符串，不是键
    if (unquote(text, t.start, t.end) !== key) continue
    const v = skipWsComments(text, k + 1, to)
    // 值范围
    let valueEnd
    if (text[v] === "{" || text[v] === "[") {
      const open = text[v]
      const close = open === "{" ? "}" : "]"
      let dd = 0
      for (const s of scan(text, v, to)) {
        if (s.type === "char") {
          if (s.ch === open) dd++
          else if (s.ch === close) { dd--; if (dd === 0) { valueEnd = s.end; break } }
        }
      }
      if (!valueEnd) return null
    } else {
      let m = v
      while (m < to && !/[,}\]]/.test(text[m])) m++
      valueEnd = m
    }
    // 尾随逗号
    const after = skipWsComments(text, valueEnd, to)
    const commaAfter = text[after] === "," ? after : null
    // 删除起点：键所在行行首，并向上吞并紧邻的注释行
    let ls = text.lastIndexOf("\n", t.start)
    ls = ls === -1 ? 0 : ls + 1
    for (;;) {
      if (ls <= 0) break
      const prevEnd = ls - 1
      const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1
      const prevLine = text.slice(prevStart, prevEnd).trim()
      if (/^(\/\/|\/\*|\*)/.test(prevLine)) ls = prevStart
      else break
    }
    return { keyStart: t.start, cutStart: ls, valueStart: v, valueEnd, commaAfter }
  }
  return null
}

// 删除一个属性：含缩进、上方注释行、尾随逗号；无尾随逗号则吃掉前导逗号
function cutProperty(text, r) {
  if (r.commaAfter !== null) return text.slice(0, r.cutStart) + text.slice(r.commaAfter + 1)
  let b = r.cutStart - 1
  while (b >= 0 && /\s/.test(text[b])) b--
  if (b >= 0 && text[b] === ",") return text.slice(0, b) + text.slice(r.valueEnd)
  return text.slice(0, r.cutStart) + text.slice(r.valueEnd)
}

// 去注释（保留字符串），用于解析与校验
function stripJsonc(text) {
  let out = ""
  for (const t of scan(text, 0, text.length)) {
    out += t.type === "comment" ? "" : text.slice(t.start, t.end)
  }
  return out
}

// ---------- 主流程 ----------

let obj
try {
  obj = JSON.parse(stripJsonc(src))
} catch (e) {
  console.error(`✗ ${file} 不是合法 JSONC：${e.message}`)
  process.exit(1)
}

const merged = { agents: {}, categories: {} }
const conflicts = []
let moved = 0
for (const sec of SECTIONS) {
  const node = obj[sec]
  if (!node || typeof node !== "object") continue
  for (const kind of MOVE_KEYS) {
    const sub = node[kind]
    if (!sub || typeof sub !== "object") continue
    for (const [name, val] of Object.entries(sub)) {
      if (merged[kind][name] !== undefined) {
        if (JSON.stringify(merged[kind][name]) !== JSON.stringify(val)) {
          conflicts.push(`${kind}.${name}：两分节都有且值不同 → 取 [opencode]`)
          if (sec !== "[opencode]") continue
        }
      }
      merged[kind][name] = val
      moved++
    }
  }
}
const finalMaps = {}
for (const kind of MOVE_KEYS) {
  finalMaps[kind] = { ...(obj[kind] || {}), ...merged[kind] }
  if (obj[kind]) {
    for (const name of Object.keys(obj[kind])) {
      if (merged[kind][name] !== undefined && JSON.stringify(obj[kind][name]) !== JSON.stringify(merged[kind][name])) {
        conflicts.push(`${kind}.${name}：顶层已有且与分节不同 → 用分节值`)
      }
    }
  }
}

if (moved === 0 && !obj["[opencode]"] && !obj["[native]"]) {
  console.log("没有 [opencode]/[native] 分节，无需迁移。")
  process.exit(0)
}

// 文本手术：先删各分节里的 agents/categories 子属性，空节整节删
let text = src
for (const kind of MOVE_KEYS) {
  for (;;) {
    const cuts = []
    for (const sec of SECTIONS) {
      const rSec = findProperty(text, sec, 1)
      if (!rSec) continue
      const rKind = findProperty(text, kind, 1, rSec.valueStart, rSec.valueEnd)
      if (rKind) cuts.push(rKind)
    }
    if (cuts.length === 0) break
    cuts.sort((a, b) => b.cutStart - a.cutStart)
    for (const r of cuts) text = cutProperty(text, r)
  }
}
for (const sec of SECTIONS) {
  const node = obj[sec]
  if (!node) continue
  const rest = Object.keys(node).filter((k) => !MOVE_KEYS.includes(k))
  if (rest.length === 0) {
    const r = findProperty(text, sec, 1)
    if (r) text = cutProperty(text, r)
  }
}

// 插入顶层 agents/categories：放在第一个非 $schema 顶层键之前
const im = text.match(/\n(\s*)"\$schema"/)
const indent = im ? im[1] : "  "
function formatProp(key, value) {
  const lines = JSON.stringify(value, null, 2).split("\n")
  const inner = lines.slice(1, -1).map((l) => (l.length ? "  " + l : l))
  return `${indent}"${key}": ${lines[0]}\n${inner.join("\n")}\n${indent}}`
}
const blocks = MOVE_KEYS.filter((k) => Object.keys(finalMaps[k]).length > 0).map((k) => formatProp(k, finalMaps[k]))
if (blocks.length > 0) {
  let ins = null
  let d = 0
  for (const t of scan(text, 0, text.length)) {
    if (t.type === "char") {
      if (t.ch === "{" || t.ch === "[") d++
      else if (t.ch === "}" || t.ch === "]") d--
      continue
    }
    if (t.type !== "string" || d !== 1) continue
    const k = skipWsComments(text, t.end)
    if (text[k] !== ":") continue
    if (unquote(text, t.start, t.end) === "$schema") continue
    let ls = text.lastIndexOf("\n", t.start)
    ls = ls === -1 ? 0 : ls + 1
    for (;;) {
      if (ls <= 0) break
      const prevEnd = ls - 1
      const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1
      if (/^(\/\/|\/\*|\*)/.test(text.slice(prevStart, prevEnd).trim())) ls = prevStart
      else break
    }
    ins = ls
    break
  }
  if (ins === null) {
    const rb = text.indexOf("{")
    ins = text.indexOf("\n", rb) + 1
  }
  text = text.slice(0, ins) + blocks.join(",\n") + ",\n" + text.slice(ins)
}

// 备份 + 校验 + 写入
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")
const backup = `${file}.bak.magpie-omo-${stamp}`
copyFileSync(file, backup)
let check
try {
  check = JSON.parse(stripJsonc(text))
} catch (e) {
  console.error(`✗ 迁移结果解析失败（${e.message}），已保留原文件。`)
  process.exit(1)
}
for (const kind of MOVE_KEYS) {
  if (JSON.stringify(check[kind] ?? {}) !== JSON.stringify(finalMaps[kind])) {
    console.error(`✗ 迁移结果校验不符（${kind}），已保留原文件。`)
    process.exit(1)
  }
}
writeFileSync(file, text)

console.log(`✓ 迁移完成：顶层 agents ${Object.keys(finalMaps.agents).length} 项、categories ${Object.keys(finalMaps.categories).length} 项（移动 ${moved} 条）`)
for (const c of conflicts) console.log(`  ⚠ ${c}`)
console.log(`  备份：${backup}`)
console.log(`  说明：被移走条目内的注释已丢失，其余注释保留。之后由 magpie Agents 页的 OmO 各行接管。`)
