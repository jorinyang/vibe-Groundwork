# 本地快检

## 为什么

没有 lint 和类型检查，agent 每次改动都不知道自己弄坏了什么。等到部署时报错，排查成本是本地拦截的几十倍。

## 必须达到的行为

| # | 断言 | 怎么观测 | rigor |
|---|---|---|---|
| 1 | 配置了快检命令 | `.vibe/config.yaml` 的 `fastcheck` 非空 | static |
| 2 | 命令真的能跑通 | 逐条执行，退出码 0 | behavioral |

## 怎么验

```bash
node src/cli.ts check --path <项目> --only local-fastcheck
```

预期首跑耗时 2–3 秒（typecheck 量级的项目）。

## 判定规则

- **依赖未安装（无 `node_modules`）判 N/A，不判失败。** 这是「不能判定」，不是「项目有问题」——误报会让人直接不信任工具。
- 命令超时（默认 180s）中止并报超时，不静默。

## 常见抄错

| 抄法 | 为什么不算通过 |
|---|---|
| package.json 里写了 lint，但实际是 `echo ok` | 闸门是假的，跑通不代表拦得住 |
| 只配 build 不配 typecheck | 构建能过但类型错误仍在 |
| 命令里带 `|| true` | 永远退出 0，等于没有闸门 |
