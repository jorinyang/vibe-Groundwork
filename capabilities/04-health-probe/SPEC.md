# 健康检查

## 为什么

部署系统需要知道什么时候可以切流量。只有一个返回 200 的空接口不够——进程活着、数据库挂了，200 会误导上游把流量打进来。

## 必须达到的行为

| # | 断言 | 怎么观测 | rigor |
|---|---|---|---|
| 1 | 存在健康端点 | 路由里出现 `/health` `/healthz` `/ready` 等 | static |
| 2 | 返回 200 | 真起服务打一次 | behavioral |
| 3 | 响应含状态字段 | JSON 里有 `status` / `ok` / `healthy` | behavioral |
| 4 | 响应区分依赖 | JSON 里有 `checks` / `dependencies` / `db` 等 | behavioral |

## 怎么验

```bash
node src/cli.ts check --path <项目> --only health-probe
```

需要 `.vibe/config.yaml` 里有 `start.command` 和 `ready.url`，否则判 N/A 并说明原因。

## 常见抄错

| 抄法 | 为什么不算通过 |
|---|---|
| `/health` 直接 `return "ok"` | 依赖挂了照样 200 |
| 把健康检查和业务鉴权绑在一起 | 探针拿不到 token，永远 401 |
| 健康检查里去查全表 | 探针本身成了故障源 |
| 就绪和存活混成一个端点 | 滚动发布时不知道该等哪个 |
