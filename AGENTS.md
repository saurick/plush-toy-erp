# plush-toy-erp 协作约定

## 阅读顺序

遇到新任务时，优先按下面顺序收敛真源：

1. `/Users/simon/projects/plush-toy-erp/README.md`
2. `/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
3. `/Users/simon/projects/plush-toy-erp/server/README.md`
4. `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
5. `/Users/simon/projects/plush-toy-erp/scripts/README.md`

如果任务已经明确落在某个子系统，再继续读对应专题文档，不要先凭印象补丁。

## 工程原则

- 先理解现状，再做最小必要改动
- 优先保留稳定、可维护、可观测的实现
- 能复用现有能力就不要额外造层
- 注释只写设计意图、边界条件和兼容性兜底，避免补丁口吻
- 代码行为、部署方式、配置字段或正式文档口径变化时，同轮更新相关文档

## 目录结构文档同步约定

- 当本仓库新增、删除、重命名仓库一级目录，或新增/调整需要长期维护的关键子系统目录时，必须同步检查并按需更新相关目录说明文档，避免代码结构已变化而 `README / docs` 仍停留在旧口径。
- 根 `README.md` 只维护仓库级目录导航；`web/README.md`、`server/README.md` 等子目录 `README` 维护各自内部目录职责，不在多处重复展开同一份内部目录树。
- 生成产物、缓存、依赖目录或临时目录（如 `build/`、`output/`、`tmp/`、`node_modules/`、`bin/`）默认不要求更新目录说明，除非它们已经成为正式入口或长期维护对象。
- 若本轮调整了目录结构但判断无需更新 `README / docs`，最终回复中必须明确说明未更新的原因与边界。

## 当前部署边界

- 当前唯一部署真源：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前仓库没有初始化 `lab-ha`、Kubernetes 清单和 dashboard；未获明确需求前，不要补回第二套部署主路径
- Compose 基线默认保留 PostgreSQL、Jaeger、`/healthz`、`/readyz` 和 `depends_on: service_healthy`
- 如果后续确实要引入 Kubernetes 或其他部署方式，必须先补正式文档，再落代码和脚本

## 初始化与收口

- 首次收口或大规模改名后，执行 `bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict`
- 该脚本用于扫出项目名、服务名、默认密钥、远端发布地址和首页文案残留
- 不需要的目录、脚本和部署物默认移动到系统回收站，不做不可恢复删除

## 数据库与迁移

- 结构变更走 Ent + Atlas，禁止手改 schema SQL
- 迁移前先确认命中的数据库：`cd /Users/simon/projects/plush-toy-erp/server && make print_db_url`
- 生成迁移后执行：`cd /Users/simon/projects/plush-toy-erp/server && make data && make migrate_status`
- 若服务逻辑依赖新表/新列，发布前先确认目标库 migration 已落地

## 前端与样式

- 样式和布局问题优先在真实浏览器中定位，不靠静态代码猜
- 前端样式改动至少执行：
  - `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test`
  - `cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1`
- 需要验证的状态至少包括默认态、交互态、恢复态和相邻区域

## 可观测性

- 新增或修改服务端链路时，同时检查日志、trace 和健康检查
- 日志优先结构化字段，禁止输出密码、密钥、完整 token 等敏感明文
- `/readyz` 默认只检查 PostgreSQL 这一项通用硬依赖，项目特有依赖按真实需要再加

## 错误码与错误提示

- 服务端错误码唯一来源：`server/internal/errcode/catalog.go`
- 前端生成码表：`web/src/common/consts/errorCodes.generated.js`
- 前端消费层：`web/src/common/consts/errorCodes.js`
- 提交前如涉及错误码，执行：
  - `bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-code-sync.sh`
  - `bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-codes.sh`
- 用户可见错误提示不要直接透传原始英文异常

## Git 约定

- 提交信息默认使用简体中文
- 个人开发场景默认不要主动创建分支
- 用户明确要求提交时可直接 `git commit`
- 用户明确要求推送时可直接 `git push`
- 强制推送、重写历史、硬重置前必须先说明风险并获得同意
