# 部署纪律

## 为什么

vibecoding 项目最常见的债不是代码烂，是**部署路径没有收敛**：每上一个功能就写一个 `apply-xxx.sh`，发版靠「把那个脚本跑一下」。半年后没人记得哪几个跑过、哪几个没跑，换个人发不了版，出问题退不回去。

## 必须达到的行为

| # | 断言 | 怎么观测 | rigor |
|---|---|---|---|
| 1 | 存在可复现的部署入口 | Dockerfile / compose / `deploy.sh` / `package.json#scripts.deploy` / `Makefile:deploy` 之一 | static |
| 2 | 一次性脚本没有成灾 | `apply-*` `fix-*` `patch-*` `diag-*` 等命名的脚本 ≤ 5 个 | static |
| 3 | 有回滚路径 | 文档或脚本提到 rollback / 回滚；或容器化（回滚由镜像 tag 承担） | static |
| 4 | 部署有文档 | 至少一份 md 讲清楚怎么发版 | static |

## 怎么验

```bash
node src/cli.ts check --path <项目> --only deploy-discipline
```

## 常见抄错

| 抄法 | 为什么不算通过 |
|---|---|
| 有 60 个 `apply-*.sh`，但每次都「能跑」 | 能跑 ≠ 可复现，别人不知道哪几个该跑 |
| 有 Dockerfile 但从不打 tag | 回滚时没有可退的版本 |
| 部署写在某个人的笔记里 | 那不是文档，那是口口相传 |
| 把一次性脚本删掉但没建迁移/发布流程 | 债没还，只是藏起来了 |

## 为什么是 yellow 不是 green

部署脚本里可能有环境相关的真实操作（切流量、改配置），自动改风险高。判定器只出说明，动手由人决定。
