# vibe-Groundwork

Engineering conformance substrate for vibecoded projects: **checks that verify behaviour, prescriptions an agent can execute, templates you can copy.**

> v0.2.0 · 七项能力 · 默认只报告不阻断 · `npx` 一行跑

## 一行跑

```bash
npx github:jorinyang/vibe-Groundwork check --path .
```

不想动网络就 clone 下来：

```bash
git clone https://github.com/jorinyang/vibe-Groundwork
cd vibe-Groundwork && npm ci && npm run build
node bin/vibe.mjs check --path <你的项目>
```

> 需要 Node ≥ 22.6。**默认不会因为失败返回非零**——第一次先看清问题；要当门禁再加 `--strict`。

## 它在解决什么

用 AI 写出来的项目通常能跑，但缺验收标准。这个仓库给的不是脚手架，而是三样东西：

| 资产 | 形态 | 谁用 |
|---|---|---|
| 运行时能力 | **复制进项目** | agent 抄改 |
| 判定能力 | **dev 依赖** | agent + CI |
| agent 接口 | **外挂 MCP** | agent 加载 |

记法：**运行时复制，判定依赖，协议外挂。**

## 七项能力

| 能力 | 级别 | rigor | 风险 | 一句话 |
|---|---|---|---|---|
| `project-constitution` | L1 | static | green | agent 进仓库能不能一屏知道规矩 |
| `env-contract` | L1 | static | green | 声明的变量和用到的对不对得上 |
| `local-fastcheck` | L2 | behavioral | green | 本地闸门是不是真的在拦 |
| `migration-discipline` | L2 | static | yellow | schema 能不能从仓库重现 |
| `deploy-discipline` | L2 | static | yellow | 部署是一条命令，还是一堆一次性脚本 |
| `health-probe` | L2 | behavioral | green | 健康检查区不区分「进程活着」和「依赖可用」 |
| `authz-default-deny` | L3 | adversarial | **red** | 未知路由 404、受保护路由 401 |

**风险等级决定处方能不能自动执行**：green 直接改，yellow 先快照，red 只出 patch。

## N/A 不是通过

报告把「没验到」分成两类，绝不混进绿：

| 标记 | 含义 |
|---|---|
| `[不适用]` | 项目根本不需要这项（不碰数据库、没有 HTTP 服务） |
| `[待配置]` | 缺启动命令/依赖，配好就能验；报告会给出具体该写什么 |

## 用法

```bash
vibe check   --path <项目> [--profile L1|L2|L3] [--only id] [--json] [--strict]
vibe list
vibe explain <id>
vibe init    --path <项目>
vibe fix     --path <项目> [--allow-risk green|yellow|red] [--apply]
```

- `check` 默认只报告；`--strict` 才有非零退出（CI 用）
- `fix` 默认只出计划；`--apply` 才动手，动手前打快照
- `init` 生成 `.vibe/config.yaml`、`AGENTS.md`、`.env.example`

MCP（给 agent 用）：

```bash
npx github:jorinyang/vibe-Groundwork vibe-mcp
```

工具：`vibe_scan` / `vibe_fix` / `vibe_explain`。

## 实战结果

| 项目 | 结论 | 找到的真问题 |
|---|---|---|
| `jorinyang/SW-IMS` | 4 项未通过 | 54 条迁移声明顺序与序号相反（全新库初始化会失败）；34 个一次性部署脚本 |
| `jorinyang/YSCOT` | 2 项未通过 | 无 agent 入口；环境变量漏声明 |
| `miguelgrinberg/microblog` | 5 项未通过 | 无部署文档；无 agent 入口 |

七个真实项目、跨 Node / Python / Go / Ruby 的验证记录见 [docs/REPORT-validation.md](docs/REPORT-validation.md)。

## 目录结构

```
bin/          npx 入口
src/
  core/       types · config · boot · runner · registry · context
  facts/      抽取：项目 / 环境变量 / 路由 / 迁移 / 部署（栈相关只在这层）
  checks/     判定：只消费 facts，不读文件（七项）
  prescribe/  处方：计划、执行、快照、风险闸门
  report/     人读 / JSON 报告
  mcp/        MCP server
capabilities/
  NN-<id>/    SPEC.md · check.yaml · prescription.yaml
tests/        判定的正反测试（好项目必须过，坏项目必须挂）
docs/         CONFORMANCE · HOW-AGENT-WORKS · REPORT-validation · REVIEW · REVIEW-fixes
```

## 两条硬约束

1. **判定器不读 reference 代码** —— 否则退化成模板自证
2. **纯静态判定不准上 L3** —— 必须与 behavioral 步骤组合

## 贡献

见 [AGENTS.md](AGENTS.md)。核心要求：加一条能力，必须同时给 `tests/` 的正反用例，且在两个对照项目上跑过。

## License

工具层 MIT，conformance spec 层 Apache-2.0。
