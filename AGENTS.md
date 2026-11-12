# AGENTS.md · vibe-Groundwork

你在这里做的是**判定工具**，不是业务系统。所有产出必须能被另一台机器复现。

## 这个仓库是什么

给 vibecoded 项目做工程化验收的底座：可复制的模板、可执行的判定、可被 agent 执行的处方。

## 怎么跑

```bash
node src/cli.ts list                 # 能力清单
node src/cli.ts check --path <项目>   # 体检
node tests/run.mjs                   # 正反测试（也是本仓库的快检）
```

Node ≥ 22.6，直接跑 `.ts`，无构建、零依赖。

## 三条铁律

1. **验行为，不验文件。** 判定只回答「行为对不对」，不回答「有没有这个文件」。
2. **判定器不读 reference。** `src/checks/` 只允许消费 `src/facts/` 抽出来的事实。
3. **红灯不可自动改。** `risk: red` 的能力（权限模型）只出 patch，不许调用执行器。

## 目录职责

| 路径 | 职责 | 能不能随便改 |
|---|---|---|
| `src/core/` | 类型、配置、启动器、运行器、注册表 | 可以，但改 runner 要重跑全量测试 |
| `src/facts/` | 抽事实，栈相关逻辑只允许在这层 | 可以，保持「只抽不判」 |
| `src/checks/` | 判逻辑，栈无关 | **不许**引入文件路径细节 |
| `src/prescribe/` | 处方解析、执行、快照、风险闸门 | 改动作类型要同步 CONFORMANCE |
| `src/mcp/` | MCP server（薄包装） | 不许在这里写判定逻辑 |
| `capabilities/NN-*/` | 每项能力四件套 | 改 SPEC 必须同步 check.yaml |
| `docs/` | CONFORMANCE / HOW-AGENT-WORKS / 验证报告 | 规格变更必须同步 |
| `tests/run.mjs` | 正反用例 | 加能力必须加用例 |

## 加一条新能力

1. `src/facts/` 加抽取（只抽事实）
2. `src/checks/` 加判定（只消费 facts）
3. `capabilities/NN-<name>/` 写四件套：`SPEC.md` / `check.yaml` / `prescription.yaml`
4. `src/core/registry.ts` 注册
5. `tests/run.mjs` 加正反用例
6. `docs/CONFORMANCE.md` 补一节

## 两个对照项目

| 项目 | 期望 | 用途 |
|---|---|---|
| `SW-IMS` | 有失败项 | 证明能发现真问题 |
| `YSCOT` | 不误伤 | 证明不会为了绿而瞎报 |

**两边都过才算合格。** 只有一头过的判定直接回炉。

## 不许做

- 不许让判定依赖外网
- 不许在判定里吞异常或 `|| true`
- 不许写「根据项目情况调整」这类不可执行的处方
- 不许为了让判定变绿去改被测项目
- 不许新增只检查文件是否存在的判定
- 不许把测试/样例代码算进生产事实（会自伤）

## 提交前自检

- [ ] `node tests/run.mjs` 全绿
- [ ] `node src/cli.ts check --path . --no-behavioral` 无 FAIL
- [ ] 两个对照项目都跑过
- [ ] 新增判定满足 DoD：rigor ≥ 8、处方每步有 verify、有反例
