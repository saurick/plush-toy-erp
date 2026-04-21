# 当前项目基线

本仓库当前已经从“通用骨架”推进到“毛绒 ERP 初始化框架”阶段：先把管理员 ERP 主路由、流程总览、帮助中心、文档页、移动端工作台和资料准备清单放进项目，再继续接真实合同、Excel 与业务实体。

## 本轮保留

- `web/` 公共登录页与 `src/erp/` 初始化壳层
- `server/` 鉴权、错误码、JSON-RPC、`/healthz`、`/readyz`、请求链路日志与 trace 基线
- `scripts/` 本地初始化、质量门禁和 Git hooks
- `server/deploy/compose/prod` 这一路径的 Compose、Jaeger 和迁移脚本
- 本地开发数据库默认命中共享 PG `192.168.0.106:5432/plush_erp`

## 本轮不初始化

- `lab-ha`
- Kubernetes 清单
- 拍照扫码、PDA、条码枪、图片识别
- 正式 Excel 导入、合同打印模板与 PDF 坐标填充

## 仍需继续确认的信息

- 更多合同、Excel、截图和移动端验收样本
- ERP 的真实核心实体、保存链路和字段真源
- `192.168.0.106` 上 `plush_erp` 数据库是否已创建，以及当前联调账号是否已有 `CONNECT` / 建表权限
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
