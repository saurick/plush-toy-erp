# 当前项目基线

本仓库当前已经完成第一轮骨架收口，目标是先把 `plush-toy-erp` 的开发与部署主路径压到最小可运行状态。

## 本轮保留

- `web/` 登录、注册、管理员登录和后台账号目录骨架
- `server/` 鉴权、错误码、JSON-RPC、`/healthz`、`/readyz`、请求链路日志与 trace 基线
- `scripts/` 本地初始化、质量门禁和 Git hooks
- `server/deploy/compose/prod` 这一路径的 Compose、Jaeger 和迁移脚本

## 本轮不初始化

- `lab-ha`
- Kubernetes 清单
- dashboard
- 与上述目录强耦合的 CI / loadtest 入口

## 仍需继续确认的信息

- ERP 的真实核心实体和业务流程
- 首页、后台工作台和菜单结构
- 生产环境真实密码、JWT 密钥、镜像仓库和远端主机
- Jaeger 保留策略和 Prometheus 指标查询地址

## 建议检查顺序

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

若本轮还涉及较大规模前端改动，再补：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```
