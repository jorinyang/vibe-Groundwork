# 项目宪法

## 为什么

没有它，agent 每次进这个仓库都要重新猜结构、猜命令、猜红线，猜错就改错地方。人换手时也一样，前一个人脑子里的规矩没留下。

## 必须达到的行为

| # | 断言 | 怎么观测 | rigor |
|---|---|---|---|
| 1 | 根目录有 agent 入口 | 存在 `AGENTS.md` / `CLAUDE.md` / `.cursorrules` 之一 | static |
| 2 | 入口一屏可读 | 行数 ≤ 150 | static |
| 3 | 入口覆盖三件事 | 含「怎么跑」「不许做」「目录结构」三类内容 | static |
| 4 | README 有可执行指令 | 正文含 `npm run` / `python` / `docker compose` 等真实命令 | static |

## 怎么验

```bash
node src/cli.ts check --path <项目> --only project-constitution
```

## 常见抄错

| 抄法 | 为什么不算通过 |
|---|---|
| 建一个空的 AGENTS.md | 文件在，规矩不在，agent 读完还是不知道能干什么 |
| 把 README 全文复制进 AGENTS.md | 超过一屏，agent 会跳读，等于没写 |
| 只写「请遵守规范」 | 没有可执行信息，等于喊口号 |
| 写「根据需要调整目录」 | 不可判定，也不可执行 |
