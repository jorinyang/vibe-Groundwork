# 权限默认拒绝

## 为什么

这是唯一一条「判错会把站点锁死」的判定，所以它也是唯一一条**禁止自动修**的判定。vibecoded 项目最常见的洞是：接口默认开放，鉴权写在某个前端页面里，或者压根没有。

## 必须达到的行为

| # | 断言 | 怎么观测 | rigor |
|---|---|---|---|
| 1 | 能抽到路由表 | 从代码里识别出 ≥1 条路由 | static |
| 2 | 存在鉴权机制 | 检测到鉴权中间件或守卫 | static |
| 3 | 没有 SPA 兜底吞掉 404 | 不存在 `app.get("*")` → index.html | static |
| 4 | 未知路由返回 404 | `GET /__vibe_probe_nonexistent__` → 404 | adversarial |
| 5 | 受保护路由拒绝匿名 | 无凭证请求受保护路由 → 401/403 | adversarial |
| 6 | 伪造凭证被拒 | `Authorization: Bearer vibe-invalid-token` → 401/403 | adversarial |

## 怎么验

```bash
node src/cli.ts check --path <项目> --only authz-default-deny
```

需要 `.vibe/config.yaml` 配好 `start.command`；否则只跑静态三条，行为三条判 N/A。

## 为什么禁止自动修

判定器认为「某路由该被保护」，自动加默认拒绝守卫——如果判错，用户站点当场不可访问。这个代价和「少一条 lint」不是一个量级。

所以处方只能是 `risk: red`，只输出 patch 说明，人工执行。

## 常见抄错

| 抄法 | 为什么不算通过 |
|---|---|
| 前端路由守卫 + 后端裸奔 | 直接调 API 就绕过了 |
| 只在登录接口验密码，其他接口信任前端 | 无凭证请求照样拿到数据 |
| 统一返回 200 + `{code: 401}` | 网关/监控认为成功，拦截不了 |
| 有 SPA fallback 吞掉所有 404 | 未知 API 返回 HTML，客户端解析崩 |
