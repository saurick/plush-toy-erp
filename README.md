# plush-toy-erp

`plush-toy-erp` 当前是一套已经开始按真实资料收口的毛绒工厂 ERP：桌面后台继续保持一个入口，移动端按角色拆成多入口、多端口，并且开始基于真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含桌面后台统一入口和六个角色移动端入口，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，当前仍保留账号、鉴权、错误码、`/healthz`、`/readyz` 与 JSON-RPC 基线 |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks |
| `docs/` | 仓库级约定、流程、数据模型、changes 和部署文档 |

## 当前边界

- 当前唯一部署真源仍是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前后端统一走 `8200`
- 当前数据库默认命中 `192.168.0.106:5432/plush_erp`
- 当前数据库已存在，但正式业务表尚未开始；`users / admin_users` 仍只是账号基线
- 拍照扫码、PDA、条码枪、图片识别本轮统一标记为 deferred

## 本地启动

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认地址：`http://localhost:5175`

### 角色移动端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:boss
pnpm start:mobile:merchandiser
pnpm start:mobile:purchasing
pnpm start:mobile:production
pnpm start:mobile:warehouse
pnpm start:mobile:finance
```

端口矩阵：

| 入口 | 端口 |
| --- | --- |
| 老板移动端 | `5186` |
| 跟单移动端 | `5187` |
| 采购移动端 | `5188` |
| 生产移动端 | `5189` |
| 仓库移动端 | `5190` |
| 财务移动端 | `5191` |

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

默认端口：

- HTTP：`8200`
- gRPC：`9200`
- PostgreSQL Compose 宿主机映射：`5435`

## 当前不做

- 拍照扫码、PDA、条码枪、图片识别
- 正式 Excel 导入落库
- 合同打印模板和 PDF 坐标填充
- 字段未稳定前的 Ent schema / migration

## 当前推荐检查命令

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

前端改动后执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

## 文档索引

- 协作约定：`/Users/simon/projects/plush-toy-erp/AGENTS.md`
- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 初始化范围：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- 主流程：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- 数据模型与导入映射：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- 当前 changes：`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`
- 前端说明：`/Users/simon/projects/plush-toy-erp/web/README.md`
- 后端说明：`/Users/simon/projects/plush-toy-erp/server/README.md`

## 数据库约束

`server` 继续使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更必须通过 `make data`
- 只有在字段关系稳定后，才开始改 `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/*.go`
