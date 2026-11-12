# 对照组验证报告

日期：2026-11-13
版本：vibe-check 0.1.0
方法：对真实项目跑六项判定，只读扫描，不改被测项目（修复闭环在副本上做）

## 一、结果

| 项目 | 通过 | 未通过 | 不适用 | 关键发现 |
|---|---|---|---|---|
| `jorinyang/SW-IMS`（库存管理） | 0 | 3 | 2 | 迁移声明顺序与序号相反；一次性脚本改数据；无 AGENTS.md；11 个环境变量未声明 |
| `jorinyang/YSCOT`（课堂运营） | 1 | 2 | 2 | 无 AGENTS.md；2 个变量未声明；无启动校验 |
| `vibe-Groundwork`（本仓库自己） | 2 | 0 | 4 | 通过（4 项因不适用而跳过） |

## 二、SW-IMS 的具体发现

1. **`apps/api/src/db/migrations.ts`：54 条迁移的声明顺序与序号相反。**
   数组第一项是 `034_rename_partial_outbound`（一条 UPDATE），第二项才是 `001_core`（建表）。
   运行器 `for (const m of migrations)` 按数组顺序执行，没有排序。
   → 全新数据库初始化时先执行 UPDATE，表还不存在，直接抛错。
   线上没炸是因为 `_migrations` 表里已有执行记录，跳过——**换机器重建、灾备恢复、新环境部署会挂在第一步**。

2. **`deploy/apply-safety-stock.mjs`：用一次性脚本执行 `UPDATE materials SET safety_stock=...`。**
   这条数据变更没有进版本化通道，换个人部署就漏。

3. **11 个环境变量被代码读取但没在 `.env.example` 里声明**（`DINGTALK_NOTICE`、`REPLENISH_COVER_DAYS`、`YIDA_OUTBOUND_FORM` 等）。

4. **没有 AGENTS.md**，agent 每次进场都要重新猜 7 个子目录的职责。

## 三、YSCOT 的具体发现

1. 没有 AGENTS.md（但 README 质量、LICENSE、THIRD-PARTY、Dockerfile 都在，属于「文档做得好、agent 入口缺」）。
2. 5 个变量（`ADMIN_DING_UNIONID` 等）未在 `deploy/.env.example` 声明。
3. 没有启动时环境校验。
4. **迁移纪律判 N/A**——项目不碰数据库，正确不适用，没有被强行要求建迁移目录。

## 四、误报记录（这部分比结果更重要）

三条误报在验证中被抓出并修掉：

| # | 误报 | 修正 |
|---|---|---|
| 1 | 把 `deploy/` 下 46 个 `apply-*.sh` 全判为迁移问题 | 打开看是部署脚本（`systemctl restart`、`curl /api/health`），不含 SQL。改为「只标真的动了数据库的脚本」 |
| 2 | 依赖未安装时把「命令找不到」判成项目失败 | 无 `node_modules` 时判 `N/A` 并说明——这是不能判定，不是项目有问题 |
| 3 | 检查器扫描自己时，自己代码里的正则字面量被当成 `app.get("*")` 和建表语句 | 测试/样例路径排除；DDL 必须出现在数据库执行上下文里；证据文案不再写成代码形态 |

**结论**：误报不是「以后注意」，是必须靠「在真实项目上跑」才能发现的东西。这也是为什么把「误报率 ≤10%」写进 DoD。

## 五、修复闭环验证

在 SW-IMS 的**副本**上（`_fixlab`）执行：

```
vibe fix --path <副本> --allow-risk green --apply
```

| 步骤 | 结果 |
|---|---|
| 快照 | 生成 `.vibe/snapshots/<时间戳>/` |
| 生成 AGENTS.md | ok，22 行 |
| 补 `.env.example` 缺失变量 | ok，追加 11 个 |
| 迁移纪律（yellow） | 阻止自动执行，只出说明 |
| 复扫 | 项目宪法 FAIL → PASS；环境契约只剩「无启动校验」一条 |

闭环成立：**判定 → 处方 → 执行 → 复扫**，全过程可回滚，红灯不动手。

## 六、还没做的

| 项 | 状态 |
|---|---|
| 数据迁移纪律升级为 behavioral（真起库验 `_migrations`） | 未做 |
| 健康检查 / 权限的行为判定在真实项目上跑通 | 未做（需要真实启动命令与就绪地址） |
| 5 个以上项目的误报率统计 | 只有 3 个样本 |
| Python 项目的 Facts 适配 | 只有基础识别 |
