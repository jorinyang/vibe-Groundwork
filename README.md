# vibe-Groundwork

Engineering conformance substrate for vibecoded projects: **templates an agent can copy, checks that verify behaviour, prescriptions an agent can execute.**

> v0.1.0 · 六项能力 · 三种接入方式（存量接入 / 新建起步 / CI 门禁）

## 它在解决什么

用 AI 写出来的项目通常能跑，但缺验收标准。这个仓库给的不是脚手架，而是三样东西：

| 资产 | 形态 | 谁用 |
|---|---|---|
| 运行时能力 | **复制进项目** | agent 抄改 |
| 判定能力 | **dev 依赖** | agent + CI |
| agent 接口 | **外挂 MCP** | agent 加载 |

记法：**运行时复制，判定依赖，协议外挂。**

## 四段流水线

```
Facts（抽取） → Checks（判定） → Findings（发现） → Prescriptions（处方）
```

栈相关性全部集中在 **Facts** 一段，Checks 不碰具体文件——这是双栈成本不翻倍的关键。

## 快速开始

```bash
# 体检
node src/cli.ts check --path <项目>
node src/cli.ts check --path <项目> --profile L3 --json

# 看看有哪些能力
node src/cli.ts list
node src/cli.ts explain authz-default-deny

# 新建项目初始化
node src/cli.ts init --path <项目>

# 按处方修（默认只出计划）
node src/cli.ts fix --path <项目> --allow-risk green --apply

# 自己测自己
node tests/run.mjs
```

Node ≥ 22.6，直接跑 `.ts`，无构建步骤，零依赖。

## 六项能力

| 能力 | 级别 | rigor | 风险 | 一句话 |
|---|---|---|---|---|
| `project-constitution` | L1 | static | green | agent 进仓库能不能一屏知道规矩 |
| `env-contract` | L1 | static | green | 声明的变量和用到的对不对得上 |
| `local-fastcheck` | L2 | behavioral | green | 本地闸门是不是真的在拦 |
| `health-probe` | L2 | behavioral | green | 健康检查区不区分「进程活着」和「依赖可用」 |
| `migration-discipline` | L2 | static | yellow | schema 能不能从仓库重现 |
| `authz-default-deny` | L3 | adversarial | **red** | 未知路由 404、受保护路由 401 |

**风险等级决定处方能不能自动执行**：green 直接改，yellow 先快照，red 只出 patch。

## 实战结果

| 项目 | 结论 | 找到的真问题 |
|---|---|---|
| `jorinyang/SW-IMS` | 3 项未通过 | 54 条迁移声明顺序与序号相反 → 全新数据库初始化会失败 |
| `jorinyang/YSCOT` | 2 项未通过 | 无 agent 入口；环境变量漏声明 |

详见 [docs/REPORT-validation.md](docs/REPORT-validation.md)，包含三条误报的修正记录。

## 目录结构

```
AGENTS.md                     agent 第一屏
vibe.spec.yaml                机器真源：能力清单与质量门槛
src/
  core/       types · config · boot · runner · registry · context
  facts/      抽取：项目 / 环境变量 / 路由 / 迁移（栈相关只在这层）
  checks/     判定：只消费 facts，不读文件（六项）
  prescribe/  处方：计划、执行、快照、风险闸门
  report/     人读 / JSON 报告
  mcp/        MCP server（vibe_scan / vibe_fix / vibe_explain）
capabilities/
  NN-<id>/    SPEC.md · check.yaml · prescription.yaml
templates/    init 用的 AGENTS.md 模板
docs/         CONFORMANCE · HOW-AGENT-WORKS · REPORT-validation
tests/        判定的正反测试（好项目必须过，坏项目必须挂）
```

## 两条硬约束

1. **判定器不读 reference 代码** —— 否则退化成模板自证
2. **纯静态判定不准上 L3** —— 必须与 behavioral 步骤组合

## 路线图

- [x] F1 双端跑通第一条判定
- [x] F2 处方可执行（快照 + 复扫 + 风险闸门）
- [x] F3 权限判定可行性（静态 + 行为探针，red 档）
- [x] C1–C5 六项能力
- [x] C6 agent 作业协议（docs/HOW-AGENT-WORKS.md）
- [x] C7 级别与 profile
- [x] C8 MCP server
- [x] C9/C10 自愈闭环与风险闸门
- [x] P2 CI 门禁 · P3 B 模式 init · P5 conformance spec
- [ ] C5 迁移纪律升 behavioral
- [ ] P1 ≥5 项目误报率统计
- [ ] P4 Python Facts 适配器

## License

工具层 MIT，conformance spec 层 Apache-2.0。
