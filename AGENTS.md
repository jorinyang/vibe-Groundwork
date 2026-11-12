# AGENTS.md · vibe-Groundwork

你在这个仓库里做的是**判定工具**，不是业务系统。所有产出都必须能被另一台机器复现。

## 这个仓库是什么

给 vibecoded 项目做工程化验收的底座。三样资产：可复制的模板、可执行的判定、可被 agent 执行的处方。

## 三条铁律

1. **验行为，不验文件。** 判定只回答「这个项目的行为对不对」，不回答「有没有这个文件」。文件存在是最容易被伪造的东西。
2. **判定器不读 reference。** `src/checks/` 里只允许消费 `src/facts/` 抽出来的事实，不许 import 或读取 `capabilities/*/reference/`。
3. **红灯不可自动改。** 判到 `risk: red` 的能力（权限模型、数据 schema、删端点），只出 patch，不许调用执行器。

## 目录职责

| 路径 | 职责 | 能不能改得随便 |
|---|---|---|
| `src/facts/` | 抽事实，栈相关逻辑只允许在这里 | 可以，但要保持「只抽不判」 |
| `src/checks/` | 判逻辑，栈无关 | **不许**引入文件路径细节 |
| `src/cli.ts` | 入口与报告 | 输出的 schema 改动要同步 README |
| `capabilities/NN-*/SPEC.md` | 能力说明，一页 | 改动必须同步 check.yaml |
| `capabilities/NN-*/check.yaml` | 判定契约 | 字段见 README 的 SPEC 规范 |
| `capabilities/NN-*/prescription.yaml` | 可执行处方 | 每个 step 必须有 verify |

## 怎么跑

```bash
node src/cli.ts check --path <项目目录>
node src/cli.ts check --path <项目目录> --json
```

Node ≥ 22.6，直接跑 `.ts`，没有构建步骤。

## 加一条新能力

1. 在 `src/facts/` 加抽取（只抽事实）
2. 在 `src/checks/` 加判定（只消费 facts）
3. 在 `capabilities/NN-<name>/` 写四件套：`SPEC.md` / `check.yaml` / `prescription.yaml` / `bad-example/`
4. 在 `src/cli.ts` 注册
5. 在两个对照项目上跑一遍，两边都要对

## 四个对照项目

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
- 不许新增一个只检查文件是否存在的判定

## 提交前自检

- [ ] 两个对照项目都跑过
- [ ] 新增判定满足 DoD：rigor ≥ 8 分、处方每步有 verify、有反例
- [ ] `--json` 输出可被程序解析
- [ ] 没有把业务逻辑塞进 checks
