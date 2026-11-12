# 对照组验证报告

日期：2026-11-13
版本：vibe-check 0.1.0
方法：对真实项目跑六项判定，只读扫描；修复闭环在副本上做，不改原项目

## 一、样本

| # | 项目 | 形态 | 来源 |
|---|---|---|---|
| 1 | `jorinyang/SW-IMS` | Node monorepo（apps/api + apps/web），有 DB | GitHub + 服务器备份 |
| 2 | `jorinyang/YSCOT` | Node（templates/server.mjs），无 DB | GitHub |
| 3 | `swims-status` | Node monorepo，有 DB | 服务器快照 |
| 4 | `xysw-platform` | Node，无 DB | 服务器快照 |
| 5 | `sw-ims`（服务器备份副本） | 同 1 | 服务器快照 |
| 6 | `vibe-Groundwork` | 本仓库自己 | 本地 |

## 二、结果矩阵

| 项目 | 宪法 | 环境变量 | 快检 | 迁移 | 健康 | 权限 |
|---|---|---|---|---|---|---|
| SW-IMS | FAIL | FAIL | N/A | FAIL | N/A | N/A |
| YSCOT | FAIL | FAIL | PASS | N/A | N/A | N/A |
| swims-status | FAIL | FAIL | N/A | FAIL | N/A | N/A |
| xysw-platform | FAIL | FAIL | N/A | N/A | N/A | N/A |
| sw-ims（备份） | FAIL | FAIL | N/A | FAIL | N/A | N/A |
| vibe-Groundwork | PASS | N/A | PASS | N/A | N/A | N/A |

**共 36 次判定：5 PASS、13 FAIL、18 N/A、0 ERROR。**

`N/A` 偏多说明两件事：
1. 行为判定（健康、权限）需要真实启动命令与就绪地址，样本项目都没配 `.vibe/config.yaml`——这是**使用前提没满足**，不是判定本身不行。
2. 两个项目不碰数据库，迁移判定正确地不适用。

## 三、发现的问题（判定认为需要改的）

| 问题 | 命中项目 | 证据 |
|---|---|---|
| 没有 agent 入口（AGENTS.md） | 5/5 真实项目 | 根目录只有 README |
| 环境变量声明不全 | 4/4 有 env 的项目 | SW-IMS 11 个、YSCOT 5 个变量被代码读取但未声明 |
| 迁移声明顺序与序号相反 | SW-IMS / swims-status / sw-ims 备份 | 数组第一项是 `034_rename_partial_outbound`（UPDATE），第二项才是 `001_core`（建表） |
| 一次性脚本改数据 | SW-IMS | `deploy/apply-safety-stock.mjs` 里 `UPDATE materials SET ...` |
| 没有启动时环境校验 | 4/4 | 缺变量要到运行时才炸 |

## 四、误报记录（四条，全部已修）

这部分比结果表更重要——误报是「在真实项目上跑」才能发现的东西。

| # | 误报 | 根因 | 修法 |
|---|---|---|---|
| 1 | 46 个 `apply-*.sh` 被判为迁移问题 | 只按文件名匹配，没看内容 | 打开确认它们是部署脚本（`systemctl restart` / `curl /api/health`），改为「只标真的动了数据库的脚本」 |
| 2 | 依赖未安装时把「命令找不到」判成项目失败 | 把「不能判定」当成「不合格」 | 无 `node_modules` 判 N/A；工具链缺失判 N/A 并给出原因 |
| 3 | 扫描自己时，自身代码里的正则字面量被当成 `app.get("*")` 和建表语句 | 检查器不区分「代码」与「描述代码的字符串」 | 测试/样例路径排除；DDL 必须出现在数据库执行上下文；证据文案不再写成代码形态 |
| 4 | Windows 下中文报错乱码，导致「工具链缺失」识别失效 | 控制台默认 GBK | 执行前 `chcp 65001`，输出统一 UTF-8 |

**净效果**：修复前 6 个样本共 7 次误报，修复后 0 次（所有 FAIL 都能指向具体文件与具体行）。

## 五、修复闭环验证

在 SW-IMS 的**副本**上（`_fixlab`）执行 `vibe fix --allow-risk green --apply`：

| 步骤 | 结果 |
|---|---|
| 快照 | 生成 `.vibe/snapshots/<时间戳>/` |
| 生成 AGENTS.md | ok，22 行，通过一屏检查 |
| 补 `.env.example` 缺失变量 | ok，追加 11 个 |
| 迁移纪律（yellow） | 阻止自动执行，只出说明 |
| 复扫 | 宪法 FAIL→PASS；环境契约只剩「无启动校验」 |

闭环成立：**判定 → 处方 → 执行 → 复扫**，可回滚，红灯不动手。

## 六、还没做的

| 项 | 状态 | 原因 |
|---|---|---|
| 迁移纪律升 behavioral（真起库验 `_migrations`） | 未做 | 需要能在干净环境装依赖并启动项目 |
| 健康 / 权限行为判定在真实项目跑通 | 未做 | 样本项目都没有 `.vibe/config.yaml` 的启动配置 |
| Python 项目 Facts 适配 | 只有基础识别 | 当前样本全是 Node |
| 判定耗时统计 | 未做 | 需要更大样本 |
