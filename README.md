# magpie-omo

把 **OmO（oh-my-openagent）** 的 agents / categories 模型分配搬进 magpie 的 Agents 页：每个 omo agent、每个任务类别一行，逐行选 magpie 的模型，magpie 把模型 id 写进 `~/.omo/omo.jsonc` 顶层对应槽位。另附 `set-plan.mjs` 一键整套换挡（套餐）。

## 为什么需要它

magpie 内置的 OmO 行只写 `~/.omo/agent/settings.json` 的全局默认模型（`defaultProvider`/`defaultModel`）。而 omo 真正的细分分配在 `~/.omo/omo.jsonc` 的 `agents`/`categories` 里（sisyphus 用什么、oracle 用什么、quick 类别用什么……），内置行管不到——此前只能手工编辑 omo.jsonc。本插件族给每个槽位一个 magpie 行。

## 关于"能不能合成一行"（结论：不能）

理想形态是像 Claude Code 那样一行点开、里面有多个模型槽位。经逐一验证，magpie 当前版本做不到：

- 内置 Claude Code 的 opus/sonnet/haiku/fable 档位是 magpie 源码里**硬编码**的（`const TIERS = [...]`，`menuRoles` 只对内置 claude/omp 生成），插件声明没有 fields 入口；
- 插件声明只有 11 个字段（id/name/config/format/model/prefix/bin/dir/ua/icon/notice/library），没有任何多槽位字段；
- `connect` 钩子返回的"多键映射"**只在 magpie 新建配置文件时写入一次**；文件已存在时换模型只更新主键，映射被忽略（实测，包括模型目录变化触发的重调）；
- 插件脚本跑在受限沙箱里（无 `node:fs`、无网络），页面插件在 iframe 沙箱里无 `fetch`——都绕不开写入限制。

所以每槽位一行是插件机制的极限形态。**行太多时可在 Agents 页把不常调的行右键隐藏**，收进可展开的 "Hidden" 折叠区，随时点开。

## 整套换挡（套餐）

```shell
node set-plan.mjs plan-balanced   # 均衡（= 2026-10 手工调优基线）
node set-plan.mjs plan-glm        # GLM 全家桶（最省积分）
node set-plan.mjs plan-flagship   # 旗舰全开（重档 Astra，轻档 Sol）
node set-plan.mjs plan-economy    # 经济（DeepSeek-Flash 打天下）
```

- 文本级替换 `~/.omo/omo.jsonc` 顶层各槽位的 model 值，**保留全部注释**；
- hephaestus 恒为 codex 订阅的 GPT（omo 的 no-hephaestus-non-gpt 拦截非 GPT）、multimodal-looker 恒为 Gemini（视觉）；
- architect / deep-high 未配置，套餐不碰；
- 换套餐后重启正在运行的 omo 会话生效。

套餐内容改 `set-plan.mjs` 里的 `PLANS` 表即可。

## 覆盖范围（23 行）

| 分组 | 行 |
|---|---|
| OpenCode 版 agents | Sisyphus、Sisyphus Junior、Hephaestus、Atlas、Prometheus、Metis、Momus、Oracle |
| 两版同名 agents | Librarian、Explore、Multimodal Looker、Plan Consultant、Plan Reviewer |
| categories | Artistry、Architect、Quick、Ultrabrain、Deep High、Deep Low、Unspecified High/Low、Visual Engineering、Writing |

## 文件说明

| 文件 | 作用 |
|---|---|
| `generate.mjs` | 生成 `packages/` 下 23 个插件包（改 ROWS 后重跑） |
| `packages/omo-*/` | 每个槽位一个插件包（`id: omo-<key>`，model 键直指顶层槽位） |
| `set-plan.mjs` | CLI 一键套餐换挡 |
| `migrate-omo-jsonc.mjs` | 把 `[opencode]`/`[native]` 分节里的分配迁到顶层（自动备份，omo 读分节优先于顶层，必须迁移后插件写入才是唯一来源） |
| `install.sh` / `uninstall.sh` | 一键装 / 卸 |

## 安装 / 卸载

```shell
./install.sh     # 迁移 omo.jsonc + 安装 23 行（重复运行安全）
./uninstall.sh   # 移除插件行；omo.jsonc 不自动还原，备份在 ~/.omo/omo.jsonc.bak.magpie-omo-*
```

## 注意

- magpie 里选**直连供应商**（如 workbuddy-ai）的模型写入裸 id（`workbuddy-ai/xxx`），选 magpie 网关供应商写入 `magpie/<供应商>/<模型>`——omo（opencode 体系）两者都能解析，但建议统一走 magpie 网关（与原有配置一致，额度集中）；
- 换模型后正在运行的 omo 会话需重启生效（行上有 notice 提示）。
