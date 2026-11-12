# AGENTS.md · {{projectName}}

> 本文件由 `vibe init` 生成。保持一屏以内，超了 agent 会跳读。

## 这个项目是什么

{{stack}} 项目。开工前先看 README 和下面的目录表，不要凭猜。

## 怎么跑

```
git clone <repo>
cp .env.example .env      # 填上变量
{{commands}}
```

## 目录职责

| 路径 | 职责 | 能不能随便改 |
|---|---|---|
| （在此填写） | | |

## 不许做

- 不许把密钥写进代码或提交 `.env`
- 不许在业务代码里直接改表结构，schema 变更只走迁移
- 不许提交前跳过 lint / typecheck
- 不许留下只跑通一次的一次性脚本

## 改动流程

1. 改代码
2. 本地跑上面的命令，全绿
3. 提交前 `vibe check --path .`

## 遇到不确定

先问，不要猜。猜错的代价比问一句大。
