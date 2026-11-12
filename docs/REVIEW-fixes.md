# Must Fix 修复记录（v0.1.0 → v0.2.0）

Phase 7 审查列了四条 Must Fix。这份记录逐条说明改了什么、拿什么验证的。

---

## 1 · 误报毁信任

**原问题**：开发者工具信誉一次性。第一次被冤枉，后面全绿也不信。审查时已实测翻车 4 次。

**改了什么**

| 改动 | 说明 |
|---|---|
| 首跑默认不阻断 | `vibe check` 默认即使有 FAIL 也返回 0，只在报告里写「未阻断：默认只报告。要当门禁用，加 `--strict`」 |
| 新增 `--strict` | CI 才用它拿非零退出码 |
| 依赖/工具链缺失判 `待配置` | 不判失败。Windows 中文环境下 cmd 的「命令不存在」是 GBK 乱码，光靠英文关键字抓不到，补了「短输出 + 替换字符」判定 |
| 环境变量读取补四门语言 | Go `os.Getenv`、Ruby `ENV[]`、Java `System.getenv`、Rust `env::var`。之前只认 JS/Python，会让「声明覆盖」**静默通过** |
| 空覆盖不再算通过 | 模板有变量、代码一个都没识别到 → 判 `待配置`，不许 vacuous pass |
| 异构样本 | 由 6 个同源 Node 项目 → 9 个跨 Node / Python / Go / Ruby / TS |
| 交叉验证抓出 3 条新误报 | 见下节 |

**验证**

- `node tests/run.mjs` 8 个用例全绿（新增部署正反例与 `naKind` 断言）
- 9 个项目、跨 Node / Python / Go / Ruby / TS 五种技术栈跑过，0 ERROR
- 每条 FAIL 都能指向具体文件（记录见 `REPORT-validation.md`）

### 交叉验证时又抓出 3 条误报

做异构样本时，原先「0 误报」的说法被推翻了。这三条都是**只有换栈/换项目才会暴露**的：

| # | 误报 | 根因 | 修法 |
|---|---|---|---|
| 5 | SW-IMS 明明有鉴权，却判「没有检测到任何鉴权中间件」 | 线索只认 `requireAuth` 一类命名；Fastify 的 `sessionUser` / `req.user =` / `preHandler`、Flask 的 `@login_required` 全漏了 | 线索表扩到 20 个常见命名与写法 |
| 6 | 代码注释里的示例 `app.get('/x')` 被当成真路由 | 抽取前没剥注释 | 按行剥离 `//` `*` `/*` `#` |
| 7 | 自身源码里的 `setNotFoundHandler` 正则源码被当成 SPA 兜底 | 跨行匹配窗口太宽 | 要求带左括号，且 200 字符内出现 `sendFile(` 或真实 `index.html` |

**结论**：误报从 11 次降到 0，但这说明——只要样本不够异构，「0 误报」就是假象。这也是为什么误报率要按项目类型分别统计，而不是给一个总数。

---

## 2 · N/A 不透明

**原问题**：N/A 占 45%（19/42），用户会以为「没测到」或「全绿」。

**改了什么**

- `Finding` 增加 `naKind`：`not-applicable`（项目不需要）/ `not-configured`（配好能验）
- `not-configured` 必须带 `howToEnable`，报告里以 `▸` 逐行打印具体该写什么配置
- 汇总行拆开：`其中不适用 N 条（项目不需要）· 待配置 M 条（配好能多验）`
- 结论语新增一档：「没有失败项，但有 M 条未验证（**不是通过，是没验**）」

**实测输出（SW-IMS）**

```
[FAIL] local-fastcheck
   n/a  toolchain-available   命令跑不起来（工具链缺失），跳过：「npm run typecheck --silent」  [待配置]
        ▸ 先完成依赖安装（如 `npm ci`），确认命令里用到的工具已装好
...
其中不适用 2 条（项目不需要）· 待配置 2 条（配好能多验）

要真正验到这些项，补一条配置即可：
   · 本地快检：未安装依赖（无 node_modules），跳过执行。先 `npm ci` 再跑本项
   · 健康检查：无法启动项目，跳过健康探针：未配置 ready.url（.vibe/config.yaml）
```

**验证**：`tests/run.mjs` 有 `expectNaKind` 断言；health / authz 的 `howToEnable` 给出完整 YAML 片段。

---

## 3 · 交付摩擦

**原问题**：要 clone、要 Node、要自己 build，摩擦大于感知价值。

**改了什么**

| 改动 | 说明 |
|---|---|
| `bin/vibe.mjs` / `bin/vibe-mcp.mjs` | 真正可执行的 bin 入口：dev 跑 `src/*.ts`，发行跑 `dist/*.js` |
| `tsconfig.build.json` + `npm run build` | TS 编译到 `dist/`，解决了 Node 拒绝在 `node_modules` 内做类型擦除的问题 |
| `prepare` 脚本 | git 安装时自动 build |
| `files` 白名单 | 只发布必要文件，`npm pack` 干净 |
| 默认非阻断 | 见第 1 条 |

**验证**

- `npm pack` → 安装到干净目录 → `npx --no-install vibe list` 正常
- `npx --no-install vibe check --path <真实项目>` 输出完整报告

**没做到的**：没有发布到 npm registry——本机 `npm whoami` 返回 401，没有凭据。当前用 `npx github:jorinyang/vibe-Groundwork` 作为一行入口。要发 npm，你执行：

```bash
npm login
npm publish        # 包名 vibe-groundwork，已确认未被占用
```

---

## 4 · 覆盖缺口

**原问题**：SW-IMS 最大的债是 60+ 一次性部署脚本，七项里没有一项管它。迁移纪律只查「含 SQL 的脚本」。

**改了什么**

- 新增 `deploy-discipline`（L2 / static / **yellow**）
- 四条断言：可复现入口、一次性脚本 ≤5、回滚路径、部署文档
- 新增 Facts：`src/facts/deploy.ts`
- 处方全部是说明，不自动改部署流程（部署改错会导致连回滚都发不出去）

**实测**

| 项目 | 结果 | 关键证据 |
|---|---|---|
| SW-IMS | FAIL | 34 个一次性脚本，超出容忍线 29 个 |
| YSCOT | PASS | `deploy/docker-compose.yml` + 部署指南 + 回滚说明 |
| microblog | FAIL | 有 Dockerfile，但没有部署文档 |
| vibe-Groundwork | N/A | 仓库型项目，无部署痕迹 → 正确不适用 |

**验证**：`tests/run.mjs` 新增「部署散成一堆一次性脚本」反例与「仓库型项目无部署」正例。

---

## 还剩什么没修

| 项 | 状态 | 原因 |
|---|---|---|
| 三项 rigor 仍为 static | 未动 | 迁移纪律升 behavioral 需要能在干净环境起库，工具链不具备 |
| 健康/权限行为判定未在真实项目跑通 | 未动 | 样本项目都没配 `.vibe/config.yaml`；需要至少一个可启动样本 |
| npm registry 发布 | 未做 | 无凭据，等你执行 `npm login && npm publish` |
| 误报率统计 | 部分 | 已按「每条 FAIL 人工复核」记录，但没有跨版本的趋势数据 |
