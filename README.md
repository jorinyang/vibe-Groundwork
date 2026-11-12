# vibe-Groundwork

A conformance substrate for vibecoded projects: **templates an agent can copy, checks that verify behaviour, prescriptions an agent can execute.**

> 状态：v0.0.1 · 第一条能力（数据迁移纪律）已跑通双端验证

## 它在解决什么

用 AI 写出来的项目通常能跑，但缺验收标准。这个仓库提供的不是脚手架，而是三样东西：

| 资产 | 形态 | 谁用 |
|---|---|---|
| 运行时能力 | **复制进项目** | agent 抄改 |
| 判定能力 | **dev 依赖** | agent + CI |
| agent 接口 | **外挂**（MCP） | agent 加载 |

记法：**运行时复制，判定依赖，协议外挂。**

## 四段流水线

```
Facts（抽取） → Checks（判定） → Findings（发现） → Prescriptions（处方）
```

栈相关性全部集中在 **Facts** 一段，Checks 不碰具体文件——这是双栈成本不翻倍的关键。

## 快速开始

```bash
node src/cli.ts check --path <项目目录>
node src/cli.ts check --path <项目目录> --json
```

退出码：`0` 通过或不适用 · `1` 有失败项 · `2` 用法错误。

## 既有验证（双端）

| 项目 | 结果 | 发现 |
|---|---|---|
| `jorinyang/SW-IMS` | FAIL | 迁移声明顺序与序号相反（034 排在 001 前）；一个一次性脚本改数据 |
| `jorinyang/YSCOT` | N/A | 项目不碰数据库，正确判不适用，不误伤 |

## 目录结构

```
src/
  cli.ts                         入口
  facts/migrations.ts            第一段：只抽事实，不做判断
  checks/migration-discipline.ts 第二段：只消费 facts，不读文件
capabilities/
  05-migration-discipline/
    SPEC.md                      为什么 / 行为断言 / 怎么验 / 常见抄错
    check.yaml                   判定契约
    prescription.yaml            可执行处方（yellow）
```

## 两条硬约束

1. **判定器不读 reference 代码** — 否则退化成模板自证
2. **纯静态判定不准上 L3** — 必须与 behavioral 步骤组合

## 路线图

- [x] F1 双端跑通第一条判定
- [ ] F2 处方可执行
- [ ] F3 权限判定可行性 spike
- [ ] C1–C5 六项能力补齐
- [ ] C6–C10 入口协议、MCP、自愈闭环
- [ ] P1–P5 误报率、CI 门禁、B 模式、Python Facts

## License

工具层 MIT，conformance spec 层 Apache-2.0。
