# 当前项目基线

本仓库当前已经从“初始化壳层”推进到“基于真实资料收口”的阶段：

- 桌面后台继续保持一个入口
- 移动端按角色拆成六个入口和六个端口
- 开始按真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射

## 当前保留

- `web/`：桌面后台统一入口 + 六个角色移动端入口
- `server/`：鉴权、错误码、JSON-RPC、`/healthz`、`/readyz`、trace 基线
- `scripts/`：本地初始化、质量门禁和 Git hooks
- `server/deploy/compose/prod`：当前唯一部署真源
- 默认开发数据库：`192.168.0.106:5432/plush_erp`

## 当前不做

- 扩展硬件链路、PDA、条码枪、图片识别
- 正式 Excel 导入落库
- 合同打印模板与 PDF 坐标填充
- 未确认字段直接进入 Ent schema

## 当前仍待确认的信息

- 订单编号 / 产品订单编号 / 客户订单号 / 产品编号 / 款式编号 的层级关系
- 客户主档和供应商主档的正式编码体系
- 正式结算单 / 对账单样本
- 出货单、仓库单据、更多加工合同样本

## 建议检查顺序

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

前端改动后继续补：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```
