# 对照组验证报告

日期：2026-11-13
版本：vibe-check 0.2.0（七项能力）
方法：对真实项目跑全量判定，只读扫描；修复闭环在副本上做，不改原项目

## 一、样本（9 个，跨 5 种技术栈）

| # | 项目 | 形态 | 语言/框架 |
|---|---|---|---|
| 1 | `jorinyang/SW-IMS` | monorepo（apps/api + apps/web），有 DB | Node / Fastify |
| 2 | `jorinyang/YSCOT` | 单文件 server + 模板，无 DB | Node 原生 http |
| 3 | `sw-ims`（服务器快照） | 同 1 | Node |
| 4 | `swims-status`（服务器快照） | monorepo，有 DB | Node / Fastify |
| 5 | `xysw-platform`（服务器快照） | 单体，无 DB | Node |
| 6 | `miguelgrinberg/microblog` | Flask 教程项目，有迁移 | Python / Flask |
| 7 | `gothinkster/golang-gin-realworld` | realworld 示例 | Go / Gin |
| 8 | `sinatra/sinatra` | 库（不是应用） | Ruby |
| 9 | `vibe-Groundwork` | 本仓库自己 | TypeScript |

## 二、结果矩阵（profile = L3，跳过行为判定）

| 项目 | 宪法 | env | 快检 | 迁移 | 部署 | 健康 | 权限 |
|---|---|---|---|---|---|---|---|
| SW-IMS | FAIL | FAIL | N/A | FAIL | FAIL | N/A | FAIL |
| YSCOT | FAIL | FAIL | PASS | N/A | PASS | N/A | N/A |
| sw-ims（快照） | FAIL | FAIL | N/A | FAIL | FAIL | N/A | FAIL |
| swims-status | FAIL | FAIL | N/A | FAIL | FAIL | N/A | FAIL |
| xysw-platform | FAIL | FAIL | N/A | N/A | FAIL | N/A | N/A |
| microblog (Py) | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | N/A |
| go-realworld (Go) | PASS | FAIL | N/A | N/A | FAIL | N/A | N/A |
| sinatra (Ruby) | FAIL | FAIL | N/A | N/A | N/A | N/A | N/A |
| vibe-Groundwork | PASS | N/A | PASS | N/A | N/A | N/A | N/A |

**合计 63 次判定：6 PASS · 29 FAIL · 28 N/A（其中 13 条是「待配置」）· 0 ERROR。**

`N/A` 里 13 条属于「缺配置才能验」，报告会给 `▸` 配置指引；其余 15 条是「项目真的不需要」。

## 三、真实发现

| 问题 | 命中项目 | 证据 |
|---|---|---|
| 没有 agent 入口 | 6/9 | 根目录只有 README |
| 环境变量声明不全 | 5/6 有 env 的项目 | SW-IMS 11 个、YSCOT 5 个、go-realworld 1 个 |
| 迁移声明顺序与序号相反 | SW-IMS 及其两个副本 | 数组第一项是 `034_...`（UPDATE），第二项才是 `001_core`（建表），全新库初始化先改表后建表 |
| 一次性脚本改数据 | SW-IMS | `deploy/apply-safety-stock.mjs` 里 `UPDATE materials SET ...` |
| **部署散成一次性脚本** | SW-IMS / swims-status / 快照 | 34 个 `apply-*.sh`，超出容忍线 29 个 |
| SPA 兜底吞掉未知 API | SW-IMS / swims-status | `setNotFoundHandler` 返回 `index.html`，未知路径返回 200 HTML |
| 没有部署文档 | microblog / go-realworld | 有 Dockerfile，但没写怎么发版、怎么回滚 |

## 四、误报记录（七条，全部已修）

这部分比结果表更重要——**误报只能靠真实项目发现**。

| # | 误报 | 根因 | 修法 |
|---|---|---|---|
| 1 | 46 个 `apply-*.sh` 被判迁移问题 | 只看文件名不看内容 | 打开确认是部署脚本（`systemctl restart` / `curl /api/health`），改为只标含 SQL 的脚本 |
| 2 | 依赖未安装判项目失败 | 把「不能判定」当「不合格」 | 无 `node_modules` 判 `N/A` |
| 3 | 扫描自己时把自身的正则字面量当成路由与建表语句 | 分不清「代码」和「描述代码的字符串」 | 排除测试路径；DDL 需数据库执行上下文；证据文案不写成代码形态 |
| 4 | Windows 中文环境报错乱码，工具链检测失效 | cmd 输出 GBK | 加 `chcp 65001`；再加「短输出 + 替换字符」兜底判定 |
| 5 | **SW-IMS 明明有鉴权却判「没有」** | 鉴权线索只认 `requireAuth` 之类，没认 Fastify 的 `sessionUser` / `req.user =` / `preHandler`，也没认 Flask 的 `@login_required` | 扩到 `sessionUser`、`publicUser`、`currentUser`、`req.user =`、`preHandler`、`login_required`、`jwt_required` 等 |
| 6 | **代码注释里的示例 `app.get('/x')` 被当成真路由** | 没区分注释与代码 | 抽取前按行剥离 `//` `*` `/*` `#` 注释 |
| 7 | **自身源码里的 `setNotFoundHandler` 正则源码被当成 SPA 兜底** | 正则跨行匹配太宽 | 要求 `setNotFoundHandler(` 带左括号，且 200 字符内出现 `sendFile(` 或真实 `index.html` |

**净效果**：修复前 9 个项目共 **11 次误报**，修复后 **0 次**——所有 FAIL 都能指向具体文件与具体行。

## 五、修复闭环验证

在 SW-IMS 的**副本**上（`_fixlab`）执行 `vibe fix --allow-risk green --apply`：

| 步骤 | 结果 |
|---|---|
| 快照 | 生成 `.vibe/snapshots/<时间戳>/` |
| 生成 AGENTS.md | ok，22 行，通过一屏检查 |
| 补 `.env.example` 缺失变量 | ok，追加 11 个 |
| 迁移 / 部署（yellow） | 阻止自动执行，只出说明 |
| 复扫 | 宪法 FAIL→PASS；环境契约只剩「无启动校验」 |

## 六、交付验证

| 检查 | 结果 |
|---|---|
| `npm pack` → 干净目录安装 → `npx --no-install vibe list` | 通过 |
| `npx --no-install vibe check --path <真实项目>` | 输出完整报告 |
| `node tests/run.mjs` | 8 个用例全绿 |

## 七、还没做的

| 项 | 状态 | 原因 |
|---|---|---|
| 迁移纪律升 behavioral（真起库验 `_migrations`） | 未做 | 需要能在干净环境装依赖并启动项目 |
| 健康 / 权限行为判定在真实项目跑通 | 未做 | 9 个样本都没有 `.vibe/config.yaml` 的启动配置 |
| npm registry 发布 | 未做 | 本机无 npm 凭据；当前用 `npx github:` 入口 |
| 误报率的时间趋势 | 未做 | 需要版本历史数据 |
