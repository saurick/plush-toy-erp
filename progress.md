## 2026-05-31 12:37
- 完成：执行 `008-v1-frontend-masterdata-order-pages`，新增 V1 客户 / 供应商 / 联系人 / 销售订单 / 销售订单行前端页面、JSON-RPC 前端 client、路由入口和前端测试；页面复用 007 已完成的 `masterdata` / `sales_order` API 与 RBAC permission code，不在前端本地派生库存、出货、财务事实，也不与 `business_records` 双写。
- 下一步：建议进入 `009-business-records-transition-audit`，单独审计 `business_records` 兼容层引用和退出路径；或进入 `010-current-customer-data-import-draft`，单独设计 current 客户数据导入 dry-run / backfill 草案。
- 阻塞/风险：本轮未改 schema、migration、generated code、repo/usecase、API/RBAC、docs registry、seedData、`business_records` transition、shipment / stock reservation / inventory / finance facts；销售订单行的 product / unit 当前只提供 ID 输入，未接产品 / 单位选择器，因为本轮禁止扩大到相关 API/UI 入口。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 01:35
- 完成：执行 `007-v1-api-rbac-masterdata-order`，为 `customers / suppliers / contacts` 接入 `masterdata` JSON-RPC API，为 `sales_orders / sales_order_items` 接入 `sales_order` JSON-RPC API；所有写入均走 005/006 已完成的 usecase，不绕过 contacts owner guard、sales order lifecycle guard、product/unit/customer active guard。同步新增 `customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.*` 动作权限和 API/RBAC 测试。
- 下一步：建议进入 `008-v1-frontend-masterdata-order-pages`，单独接 UI；继续禁止在 UI 轮混入 schema/migration、shipment facts、inventory facts、finance facts 或 `business_records` migration。
- 阻塞/风险：本轮未接 UI、docs registry、seedData、移动端页面或 `business_records` transition；未改 Ent schema、migration、generated code、`workflow.go` 或 repo/usecase。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:57
- 完成：执行 `006-v1-repo-usecase-sales-order`，新增 `sales_orders / sales_order_items` 后端 repo/usecase 和测试；订单生命周期只使用 `draft / submitted / active / closed / canceled`，订单行状态只使用 `open / closed / canceled`；创建订单校验 active customer，创建 / 更新订单行校验 active product 和 active unit。本轮没有写 shipment、inventory、stock reservation、finance、invoice、payment 或 Workflow facts。
- 下一步：建议进入 `007-v1-api-rbac-masterdata-order`，单独接入 customers / suppliers / contacts / sales_orders API 与 RBAC 动作权限，继续把 API/RBAC 与 UI 拆轮执行。
- 阻塞/风险：本轮未接 API/RBAC/UI、docs registry、seedData 或 `business_records` transition；目标库 migration 是否已 apply 仍不是本轮范围，未执行 migration apply / status。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:37
- 完成：执行 `005-v1-repo-usecase-masterdata`，新增 `customers / suppliers / contacts` 后端 MasterData repo/usecase 和测试；contacts create/update 会在 usecase 校验 `owner_type` 只能是 `CUSTOMER / SUPPLIER`，并校验 `owner_id` 对应客户或供应商存在；设置主联系人采用事务内自动取消同一 owner 其他 primary 的策略。本轮未接 API/RBAC/UI、docs registry、seedData、sales order usecase 或 `business_records` transition。
- 下一步：建议进入 `006-v1-repo-usecase-sales-order`，单独实现销售订单 Source Document repo/usecase 和生命周期状态机，继续禁止写库存、出货、财务事实。
- 阻塞/风险：目标库 migration 是否已 apply 仍不是本轮范围；当前只通过 SQLite/Go 测试验证 repo/usecase 行为，未接外部 API 入口。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:42
- 完成：收紧 Codex Goal 审查报告规则，明确 `.codex-review/latest.md` 只在正式执行 `docs/codex-goals/<goal>.md`、修复当前 Goal 遗漏 / 测试失败 / 审查报告，或用户明确要求生成审查报告时才生成或覆盖；普通问答、检查、解释、临时排查、小格式修复、非 Goal 的“下一步”不生成、不覆盖、也不删除该文件。同步更新 `AGENTS.md`、`docs/codex-goals/README.md` 和 `docs/codex-goals/_review-output-protocol.md`。
- 完成：补充“Codex 没有可靠内置 Goal 模式标志，必须根据当前上下文判断”的说明；若上下文不明确，默认按普通任务处理，不碰 `.codex-review/latest.md`。
- 下一步：后续普通文档小修仍按需更新 `progress.md`，但不再套用 `.codex-review/latest.md` 审查报告流程；正式 Goal 收口时继续按协议生成审查报告。
- 阻塞/风险：本轮只改协作规则文档和进度记录，不恢复此前被误删的本地临时 `.codex-review/latest.md`；当前工作区仍有其他业务和 Goal 草稿改动未纳入本轮处理。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:34
- 完成：修正 `docs/product/v1-next-codex-goals.md` 汉化后的 Markdown 格式问题：移除重复 H1，补齐文件末尾 newline，并把表格中含 `|` / `||` 的测试命令改为不破坏表格分列的 HTML code + entity 写法。本轮只做文档格式修复，不改变 V1 Goal 顺序、实现状态、运行时代码、Ent schema、migration、API、UI、docs registry 或 seedData。
- 下一步：继续处理 `005-v1-repo-usecase-masterdata` 时，按该 Goal 文件单独收敛允许 / 禁止路径和测试命令；不要把 sales order usecase、API/RBAC 或 UI 混进同一轮。
- 阻塞/风险：当前工作区仍有未跟踪的 `docs/codex-goals/005-v1-repo-usecase-masterdata.md` 与 masterdata backend 草稿文件，本轮未回退、整理或纳入验证；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:16
- 完成：执行 `004-v1-migration-and-ent-generate`，基于 003 的 `customers / suppliers / contacts / sales_orders / sales_order_items` 五个 Ent schema 运行 `make data`，生成 Ent 代码与 Atlas migration `server/internal/data/model/migrate/20260530161152_migrate.sql`。本轮未接 repo/usecase、API/RBAC、UI、docs registry、seedData 或 `business_records` transition。
- 下一步：建议拆分进入 `005-v1-repo-usecase-masterdata`，先做 customers / suppliers / contacts repo/usecase 和测试；再进入 `006-v1-repo-usecase-sales-order`，单独处理销售订单 Source Document 生命周期。
- 阻塞/风险：目标库 `make migrate_status` 仍显示 migration pending，本轮只生成不 apply；contacts 的跨 customers / suppliers owner 存在性仍需后续 usecase guard；本轮未执行前端或浏览器回归，因为未改 UI / 样式。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-31 00:20
- 完成：将丢失名称的 `docs/codex-goals/000-.md` 按同目录命名规则和文件内容重命名为 `docs/codex-goals/000-phase0-foundation.md`；该文件对应 Phase 0 产品化架构、状态分层、配置权限、客户实例和交付骨架任务。
- 下一步：后续引用 Phase 0 Goal 时统一使用 `docs/codex-goals/000-phase0-foundation.md`，继续保持 `001` 到 `004` 的编号顺序。
- 阻塞/风险：本轮只修复 Goal 文件名并更新进度记录，不改运行时代码、Ent schema、migration、API、UI、docs registry 或 seedData；当前工作区仍有其他未提交 Ent/migration 现场和 `004` Goal 文件，本轮未回退、整理或纳入验证。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 23:24
- 完成：执行 `003-v1-ent-schema-customers-suppliers-orders` 的 schema-only cutline，新增 `customers / suppliers / contacts / sales_orders / sales_order_items` 五个 Ent schema 文件；同步小幅更新 `docs/current-source-of-truth.md`、`docs/product/v1-implementation-cutline.md`、`docs/product/v1-schema-go-no-go.md` 和 `docs/product/v1-next-codex-goals.md`，明确本轮只新增 schema 文件，不生成 migration / Ent generated code，不接 repo/usecase、API、RBAC、UI、docs registry 或 seedData。
- 下一步：下一轮按独立 Goal 执行 Ent generate / Atlas migration 前，继续复核 `tenant_id` 禁止项、`product_skus` / `purchase_orders` / `shipments` deferred 边界，以及 `shipping_released != shipped`。
- 阻塞/风险：contacts 采用 `owner_type + owner_id`，DB 只约束 owner_type 枚举和主联系人唯一，跨 customers / suppliers 存在性需要后续 usecase guard；销售订单只落 Source Document 生命周期，不落 fulfillment / shipment / finance fact 字段。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 23:03
- 完成：将 `.codex-review/` 收口为本地临时审查交接产物，新增 `.gitignore` 忽略规则，并同步更新 `AGENTS.md`、`docs/codex-goals/README.md`、`_new-session-goal-template.md`、`_review-output-protocol.md` 和 `_goal-file-template.md` 的口径，明确每轮只生成本地 `.codex-review/latest.md`，不生成 runs 历史副本，也不提交 `.codex-review/`；长期记录应进入具体 Goal 文件、`progress.md` 或正式文档。
- 下一步：后续如果需要查看历史目标，优先查 `docs/codex-goals/*.md`、`progress.md` 和 Git commit log，不依赖 `.codex-review/runs`。
- 阻塞/风险：本轮只改 Codex 工作流文档和 Git 忽略规则，不触达运行时代码、Ent schema、migration、API、UI、docs registry 或 seedData；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 19:09
- 完成：在 `docs/codex-goals/README.md` 增加“新会话短 Goal 模板”说明，明确 `_new-session-goal-template.md` 只用于复制到 Codex Goal 输入框，具体任务范围、允许 / 禁止修改文件、验收命令和风险边界仍写入具体 `docs/codex-goals/<goal-file>.md`；同时标明新建具体 Goal 文件使用 `_template.md`。
- 下一步：后续可按需瘦身 `_new-session-goal-template.md`，避免在短 Goal 模板里重复长期项目边界。
- 阻塞/风险：当前工作区仍有大量本轮外改动和未跟踪文件，本轮未整理或回退；更新前已确认 `progress.md` 未达到归档阈值。

## 2026-05-30 19:05
- 完成：新增 `docs/codex-goals/_template.md`，沉淀 Codex Goal 文件模板，覆盖目标、必须先读、允许/禁止修改、明确不做、验收命令、review 输出和风险边界；同步在 `docs/codex-goals/README.md` 增加模板入口。本轮只改 Codex 工作流文档，不触达运行时代码、Ent schema、migration、API、UI、docs registry、seedData 或部署。
- 下一步：后续新建复杂 Goal 时先复制 `_template.md`，再按具体任务收窄允许路径、禁止路径和验收命令。
- 阻塞/风险：当前工作区已有大量本轮外改动和未跟踪文件，本轮未整理、回退或纳入验证；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 19:01
- 完成：合并扩展 `AGENTS.md` 的 Codex 工作流与 Goal 交接章节，补齐同一 Goal 后续处理、新开会话建议、Goal 输入规则、审查报告历史副本、长期规则来源和项目长期边界；本轮只改协作规则文档，不改 runtime、Ent schema、migration、API、UI、docs registry 或 seedData。
- 下一步：后续新增或执行 `docs/codex-goals/*.md` 时，继续以任务 md 的允许 / 禁止文件和验收命令为准，并按 `docs/codex-goals/_review-output-protocol.md` 生成 `.codex-review/latest.md`。
- 阻塞/风险：当前工作区已有本轮前的多项未提交文档 / 骨架现场，本轮未回退或整理；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 02:58
- 完成：完成 Phase 2 schema final review docs-only 收口，新增 `docs/product/schema-design-final-review.md`、`docs/product/v1-entity-decision-record.md`、`docs/product/v1-implementation-cutline.md`、`docs/product/v1-schema-go-no-go.md`、`docs/product/business-records-transition-plan.md` 和 `docs/product/v1-next-codex-goals.md`；同步小幅更新真源索引、V1/V2 schema draft、Phase 1 implementation plan、risk register 和 rewrite roadmap。本轮不改 runtime、Ent schema、migration、API、UI、docs registry、seedData、`workflow.go`、`rbac.go`、`server/internal/data` 或 `server/internal/core`。
- 下一步：建议按 `003-v1-ent-schema-customers-suppliers-orders` 只落 `customers / suppliers / contacts / sales_orders / sales_order_items` Ent schema；`product_skus`、采购订单、BOM version extension、出货、预留和财务事实继续保持 draft-only / deferred。
- 阻塞/风险：`business_records` shadow model 仍需引用审计和迁移 dry-run；`contacts` 的 `owner_type + owner_id` 需要下一轮 schema 明确 DB check / usecase guard；本轮已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-30 01:18
- 完成：新增 Phase 1 masterdata / order / BOM / purchase 架构评审文档、V1/V2 schema draft、migration readiness checklist、phase1 implementation plan 和 risk register；同步小幅更新 `docs/current-source-of-truth.md`、`docs/product/domain-model-v1.md`、`docs/product/rewrite-roadmap.md`。本轮只写文档和实施计划，不改 runtime、Ent schema、migration、docs registry、seedData、`workflow.go`、`rbac.go` 或 `server/internal/data`。
- 下一步：建议按 `docs/product/phase1-implementation-plan.md` 从 `002-schema-design-final-review` 开始，先做 schema final review，再拆客户/供应商 schema、repo/usecase、销售订单 schema/usecase、API/RBAC、前端和导入草案。
- 阻塞/风险：`product_skus` 是否 V1 落 schema、contacts owner 模型、`business_records` 迁移退出路径、采购订单是否 V2、以及出货/财务事实生成时机仍需后续独立评审；本轮明确不新增 `tenant_id`，current 客户资料不进入 Product Core 真源。

## 2026-05-30 00:00
- 完成：完成 Phase 0 只读设计输入与文档 / 目录骨架收口。两个外部设计 md 已导入 `docs/reference/imported-notes/` 并标记为 Imported Design Note / Reference Only；正式产品架构、产品原则、领域模型草案、模块边界、配置权限策略、客户实例策略、客户差异策略、重构路线、release gates、测试策略和状态 / Workflow / Fact 边界已落到 `docs/product/*` 与 `docs/architecture/status-workflow-fact-boundary.md`。同时建立 `docs/customers/current/*`、`config/industry-templates/plush`、`config/customers/current`、`deployments/current`、`server/internal/core/*`、`web/src/erp/modules`、`web/src/erp/mobile/roles` 骨架，并同步更新 README、真源索引和开发验收入口摘要。
- 下一步：下一轮应优先做 Phase 1 的主数据 / 订单源单据评审，或针对 current 客户资料做单独的文件清单、引用关系、docs registry、测试断言和回滚风险评审；不要在未评审前把 current 资料迁移进 Product Core，也不要新增 `tenant_id`。
- 阻塞/风险：本轮不改 runtime、Ent schema、migration、`workflow.go`、`rbac.go`、`server/internal/data`、`web/src/erp/config/docs.mjs` 或 `seedData.mjs`，也不创建运行时 config loader。`grep tenant_id` 会命中 imported notes 和正式文档中的“禁止新增”说明；这些不是 schema 或 runtime 方案。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-28 23:29
- 完成：补充文档真源层级规则，明确 `docs/changes/` 只记录历史变更、设计评审和当时验收，不能作为当前状态、当前能力或当前禁止事项的最终真源；当前状态应以 `docs/current-source-of-truth.md`、正式能力账本（如后续新增 `docs/capability-ledger.md` 或等价文档）、当前代码和当前测试交叉确认为准。同步更新 `AGENTS.md` 与 `docs/current-source-of-truth.md`。
- 下一步：如果后续要启用独立 `docs/capability-ledger.md`，应单独补齐文件结构、维护职责、与系统分层进度文档的边界和测试 / 文档引用。
- 阻塞/风险：本轮只补文档规则，没有新建能力账本，也未改变代码、schema、菜单、测试或部署配置；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-14 14:51
- 完成：按“单纯列问题，其余都不要”的口径重写 Word 文档 `/Users/simon/projects/plush-toy-erp/output/doc/erp-customer-requirements-questionnaire.docx`，并同步覆盖桌面文件 `/Users/simon/Desktop/erp-customer-requirements-questionnaire.docx`。新版只保留 9 个业务分类标题和 73 条问题，删除封面式标题、访谈信息、使用说明、表格、客户反馈栏和待确认事项汇总。
- 下一步：如客户反馈后需要形成正式需求确认稿，再基于这份问题清单整理结论并同步相关正式文档。
- 阻塞/风险：已检查两份 `.docx` 均为 82 个非空段落、9 个标题、73 条问题、0 张表格，且 `unzip -t` 通过；本轮未做逐页 PDF 渲染，因为当前文档已是纯文本问题列表且本机没有 LibreOffice/soffice。

## 2026-05-14 14:38
- 完成：按客户访谈问题清单生成 Word 文档 `/Users/simon/projects/plush-toy-erp/output/doc/erp-customer-requirements-questionnaire.docx`，整理为 9 个业务模块、73 条调研问题和 10 行待确认事项汇总表，便于现场记录客户反馈、当前做法和系统落地结论。本轮只新增文档交付物，不改变业务代码、schema、菜单入口、部署配置或正式业务真源。
- 下一步：如后续客户给出回答，可在该 Word 基础上整理为正式需求确认稿，并按影响范围同步 `docs/current-source-of-truth.md`、产品化 / 交付文档或对应业务边界文档。
- 阻塞/风险：已用 `python-docx` 结构检查确认文档包含 10 个章节、73 条问题和 10 行汇总记录，并通过 `unzip -t` 校验文件完整；本机未发现 LibreOffice/soffice，无法执行逐页 PDF 渲染，只通过 macOS Quick Look 生成首页预览图做版面抽检。

## 2026-05-13 22:14
- 完成：将线上 Atlas migration 口径收口到正式规则与脚本：`AGENTS.md`、`docs/deployment-conventions.md`、`server/deploy/README.md` 和 `server/deploy/compose/prod/README.md` 均明确低配服务器使用宿主机 `/usr/local/bin/atlas`，禁止 `arigaio/atlas:*` 临时容器和 Compose 内 Atlas；`migrate_online.sh` 已从 Docker Atlas 容器改为宿主机 Atlas + `flock /tmp/atlas-migrate.lock`，默认通过宿主机 PostgreSQL 映射端口执行 `status / dry-run / apply`。
- 下一步：后续发布时先确认服务器已有 `/usr/local/bin/atlas`；如继续扩展发布脚本，可把 Atlas 版本和端口可达性纳入 preflight。
- 阻塞/风险：本轮未连接线上数据库执行迁移，只做规则、runbook 和脚本主路径收口；若某台服务器没有安装 Atlas，脚本会提前失败并提示安装。

## 2026-05-13 00:14
- 完成：在 Cloudflare DNS 补齐后，继续完成 `8.218.4.199` 上的移动端 HTTPS 部署。已为 `boss / business / purchasing / production / warehouse / finance / pmc / quality.yoyoosun.net` 签发一张 Let's Encrypt SAN 证书并安装到 `/etc/nginx/certs/mobile.yoyoosun.net/`，Nginx 已把 8 个移动端域名切为 HTTPS 入口并分别反代到 `5186-5193`。已为 `yoyoosun.net` 根域签发独立证书并配置 `https://yoyoosun.net` 跳转到 `https://admin.yoyoosun.net`。续签继续由 `/usr/local/sbin/renew-acme-certs.sh` 统一执行，root crontab 为每天 `03:23`。
- 验证：公网 `https://admin.yoyoosun.net/healthz` 返回桌面后台健康信息，`https://yoyoosun.net/` 返回 301 到后台域名；公网 8 个移动端 `https://<role>.yoyoosun.net/healthz` 均返回对应角色健康信息。远端执行 `/usr/local/sbin/renew-acme-certs.sh` 后，`acme.sh --list` 已包含 `admin.yoyoosun.net`、`boss.yoyoosun.net` SAN 证书、`yoyoosun.net` 和既有 `oauth-api.saurick.me`；远端 `nginx -t` 通过，本项目 Compose 容器仍处于运行 / healthy 状态。
- 下一步：后续如新增角色移动端域名，需要同时更新 Nginx server block、重新签发包含新域名的 SAN 证书，并确认 acme.sh 续签列表。
- 阻塞/风险：本轮只变更线上 Nginx / 证书 / 续签配置和部署 README，不重建应用镜像，不改 Compose、业务代码、schema 或数据库。Cloudflare 当前为 Proxied 模式，实际公网证书链先经过 Cloudflare，源站证书仍已按 Full Strict 可用方式配置。

## 2026-05-13 00:03
- 完成：将 `plush-toy-erp` 线上网关域名收口到 `admin.yoyoosun.net` 和 8 个角色移动端子域名。服务器 `8.218.4.199` 上已配置 Nginx：`admin.yoyoosun.net` 通过 HTTPS 反代到桌面后台 `127.0.0.1:5175`；老板、业务、采购、生产、仓库、财务、PMC、品质移动端域名分别预置 HTTP / ACME 入口并反代到 `5186-5193`。已通过 acme.sh 为 `admin.yoyoosun.net` 签发 Let's Encrypt 证书，安装到 `/etc/nginx/certs/admin.yoyoosun.net/`，并把 root crontab 的续签入口收口到 `/usr/local/sbin/renew-acme-certs.sh`，每天 `03:23` 执行 `acme.sh --cron` 后校验并 reload Nginx。同步更新 `server/deploy/compose/prod/README.md` 的生产域名映射。
- 验证：已执行远端 `nginx -t`、`systemctl reload nginx`、`/usr/local/sbin/renew-acme-certs.sh`；`acme.sh --list` 显示 `admin.yoyoosun.net` 已纳入续签，当前下一次续签时间为 `2026-06-10T15:58:39Z`。公网 `https://admin.yoyoosun.net/healthz` 返回桌面后台健康信息；直连解析到 `8.218.4.199` 的 8 个移动端 Host 均返回对应角色 `/healthz`；本项目 Compose 容器仍处于运行 / healthy 状态。
- 下一步：在 DNS 中继续为 `boss / business / purchasing / production / warehouse / finance / pmc / quality.yoyoosun.net` 添加 A 记录到 `8.218.4.199`。移动端 DNS 生效后，再签发包含移动端域名的证书并把移动端入口切换为 HTTPS。
- 阻塞/风险：当前 `admin.yoyoosun.net` 已有 A 记录但解析表现为 Cloudflare 代理地址；8 个移动端子域名当前还没有公网 A 记录，因此本轮不能签发移动端证书。移动端暂只完成服务器侧 HTTP / ACME 预置和直连 Host 回归，不代表公网 DNS 已可访问。

## 2026-05-10 00:30
- 完成：补充 `AGENTS.md` 的多项目低配 Docker 宿主机发布后清理约束，明确发布完成、健康检查和必要回归通过后，只清理未被任何容器使用的旧镜像与构建缓存，优先使用 `docker image prune -a -f` 与 `docker builder prune -f`；清理前后记录磁盘、Docker 占用和运行容器状态，并禁止清理 volume、数据库目录、compose `.env`、上传目录或运行中容器依赖镜像。
- 下一步：如后续继续完善发布脚本，可将该约束落为 post-deploy cleanup，并保留必要回滚镜像边界。
- 阻塞/风险：本轮只更新协作约束文档，未修改运行代码、部署脚本或线上服务。

## 2026-05-09 11:57
- 完成：按 trade-erp 同口径把桌面业务表单里的条目卡片滚动边界上移到整组明细。当前明细真源仍为表单 / 业务记录 `items` 数组，本轮只改前端布局和 L1 断言，不改保存、带值、打印、导出、后端或数据库。`BusinessModulePage.jsx` 现在复用一次 `itemRowMinWidth`，用 `.erp-business-record-form__items-scroll` 统一承接横向 / 纵向滚动，单个 `.erp-item-card` 不再各自接管横向滚动；`app.css` 删除逐条滚动样式，改为整组滚动容器；`styleL1.mjs` 同步验证整组滚动容器和联系人明细 focus 恢复态。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint`、`pnpm css`、`pnpm test`，全量 node test `270` 条通过；已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1`，真实浏览器 `45` 个场景通过，覆盖业务模块新建弹窗、BOM 明细弹窗、客户/供应商联系人明细 focus、默认态 / 交互态 / 恢复态和相邻页面。
- 下一步：如甲方还希望条目区高度更小或横向滚动条固定可见，可再按真实使用反馈调整 `.erp-business-record-form__items-scroll` 的 `max-height` 或补粘性横向滚动条；当前实现先保持整组滚动，不重排条目字段。
- 阻塞/风险：未更新 `docs/current-source-of-truth.md`、产品化文档或帮助中心正式口径，因为本轮是局部表单布局调整，不改变业务能力、架构边界、菜单入口、字段真源、数据模型或交付状态。当前工作区仍有本轮外改动（如部署、顶部摘要、表头排序相关文件），本轮未回退这些现场。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 11:54
- 完成：按 trade-erp 同口径给桌面业务列表补表头排序。`BusinessModulePage.jsx` 现在维护表头排序状态，点击任一可见列名可升序 / 降序排列，顶部“最新 / 最早”切换会清空表头排序并回到创建时间排序；导出当前结果沿用当前筛选、列顺序和页面排序。`moduleRecordSort.mjs` 收口为统一排序工具：默认仍按 `created_at`，表头排序支持普通字段、`payload.*` 路径、数字、文本和明细数组长度，空值固定排最后。本轮只改变前端展示和导出顺序，不改变 `business_records` 真源、保存、流转、后端或数据库。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm exec node --test src/erp/utils/moduleRecordSort.test.mjs`、`pnpm lint`、`pnpm css`、`pnpm test`；全量前端 node test `273` 条通过。未执行 `pnpm style:l1`，因为本轮排序改动不触达样式布局，且当前工作区已有条目滚动相关样式 / L1 脚本现场。
- 下一步：如需更强浏览器级验收，可在现有条目滚动现场收口后，补一个业务页点击客户名称、金额和明细列的浏览器回归场景。
- 阻塞/风险：当前工作区已有本轮外改动 `/Users/simon/projects/plush-toy-erp/web/Dockerfile`、`/Users/simon/projects/plush-toy-erp/web/scripts/serveStaticApp.mjs`、`/Users/simon/projects/plush-toy-erp/web/scripts/styleL1.mjs`、`/Users/simon/projects/plush-toy-erp/web/src/erp/styles/app.css`，且 `BusinessModulePage.jsx` 中已有顶部摘要和条目滚动改动；本轮未回退这些现场。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 11:49
- 完成：按 trade-erp 同口径收口桌面业务页顶部摘要。当前展示层在 `/Users/simon/projects/plush-toy-erp/web/src/erp/pages/BusinessModulePage.jsx` 统一隐藏客户、供应商 / 加工厂、主责角色等分类 chip，并且工具栏摘要只在 `summaryMetric` 为金额类时显示 `金额合计`；数量类业务页不再显示 `数量合计` 摘要 chip。顶部 `总记录 / 当前结果 / 已选记录` 仍保留为筛选与选中态反馈。本轮不改保存、导入、打印、导出、后端、数据库或业务字段真源。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint`、`pnpm css`、`pnpm test`，其中 node test `270` 条通过；已执行 `STYLE_L1_SCENARIOS=business-processing-contracts-desktop,business-reconciliation-desktop pnpm style:l1`，`2` 个业务页浏览器场景通过，覆盖默认业务页与金额业务页相邻布局。完整 `pnpm style:l1` 仍失败在既有 / 并行的 `business-partners-contact-focus` 联系人条目卡片横向滚动容器断言，失败点是条目卡片滚动样式，不是本轮顶部摘要路径。
- 下一步：如需恢复完整 L1 绿灯，先收口当前工作区里条目卡片统一滚动相关改动对客户/供应商联系人明细的影响；本轮摘要改动无需回退。
- 阻塞/风险：当前工作区已有本轮外改动 `/Users/simon/projects/plush-toy-erp/web/Dockerfile`、`/Users/simon/projects/plush-toy-erp/web/scripts/serveStaticApp.mjs`，且执行期间同一工作区出现 `/Users/simon/projects/plush-toy-erp/web/src/erp/styles/app.css` 与 `BusinessModulePage.jsx` 的条目滚动相关改动，本轮未回退这些现场。未更新 `docs/current-source-of-truth.md`、系统层进度或产品化文档，因为本轮只是业务页摘要展示口径，不改变业务保存真源、架构边界、菜单入口、部署方式或产品化状态。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 00:21
- 完成：按“本地构建、服务器只加载运行”的部署主路径，将 `plush-toy-erp` 发布到 `8.218.4.199`。本地构建 linux/amd64 的服务端与 Web 镜像并通过 `docker save | ssh docker load` 上传；服务器侧只执行 `docker load`、`docker compose up`、`migrate_online.sh --apply` 和健康检查。补齐 Compose 运行时必需的 `APP_JWT_SECRET / APP_ADMIN_USERNAME / APP_ADMIN_PASSWORD` 环境变量映射，修复 Web 静态服务 `/healthz` 未定义 `appId` 导致健康检查 500 的问题，并将 Dockerfile 的 pnpm 版本固定到 `10.13.1`、移除服务端 Dockerfile 对远端 BuildKit cache mount 的强依赖。因云侧高位 Web 端口未稳定公网命中，服务器新增只匹配 `Host: 8.218.4.199` 的 Nginx HTTP 入口，将 `http://8.218.4.199/` 反代到桌面端 `127.0.0.1:5175`，不影响既有 `openai.saurick.space` 配置。
- 验证：本地已执行 `docker buildx build --platform linux/amd64 --load -f server/Dockerfile -t plush-toy-erp-server:dev .`、`docker buildx build --platform linux/amd64 --load -f web/Dockerfile -t plush-toy-erp-web:dev .`，并用临时 Web 容器确认 `/healthz` 返回 `200`。服务器已执行 migration，`sh migrate_online.sh --status-only` 显示 `Migration Status: OK`、当前版本 `20260426142444`、pending `0`；Compose 中 PostgreSQL 与 9 个 Web 容器均为 healthy，后端 `/healthz`、`/readyz` 通过；公网 `http://8.218.4.199/`、`/healthz`、`8300/readyz` 通过，静态资源和管理员登录 JSON-RPC 已通过最小请求校验。同步执行 `docker compose -f server/deploy/compose/prod/compose.yml config --quiet`、`bash scripts/project-scan.sh --strict`、`git diff --check`。
- 下一步：如果需要移动端公网直连，优先在云安全组开放 `5186-5193` 或为每个移动端分配独立域名 / 网关 Host；不要在未调整构建 base path 的情况下直接挂路径前缀。初始管理员密码只保存在服务器 `.env`，不要在聊天或文档中明文传播。
- 阻塞/风险：本轮未执行完整浏览器登录后的业务页面回归，也未调整阿里云安全组；移动端固定端口当前已在服务器本机健康，但从本机公网链路访问高位端口未命中服务器，公网入口目前以 Nginx 的桌面端 HTTP 入口为准。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 00:40
- 完成：把 trade-erp 的服务端镜像构建缓存与 PDF/Chrome 运行时口径同步到本项目。`server/Dockerfile` 改为 Go 1.26.2 builder、Debian bookworm runtime，内置 `chromium` 与 `fonts-noto-cjk`，将动态版本参数放到 Chromium / 字体安装层之后，并恢复 Go module / build cache mount；`.dockerignore` 补充本地构建产物和 QA 输出排除；`server/Makefile` 同步默认构建镜像。PDF 引擎继续以 `server/internal/server/template_pdf.go` 的共享 Chromium manager 为运行时缓存真源，本轮补齐 Playwright Chromium 本地兜底探测和 manager 复用 / 重启 / 清理单测。Compose / `.env.example` / 部署文档 / 后端运行配置文档同步 `ERP_PDF_CHROME_PATH=/usr/bin/chromium`、`ERP_PDF_RENDER_CONCURRENCY=2` 与 app 容器内存预算。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/server && go test ./internal/server -run 'TestResolveTemplatePDF|TestTemplatePDFChromeManager|TestAdminRequestVerifier'`、`cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod && docker compose -f compose.yml config`、`cd /Users/simon/projects/plush-toy-erp && git diff --check`。已执行 `DOCKER_BUILDKIT=1 docker build -f server/Dockerfile -t plush-toy-erp-server:pdf-cache-check .`，构建通过；已用临时镜像确认 `/usr/bin/chromium --version` 返回 Debian Chromium，镜像环境包含 `ERP_PDF_CHROME_PATH=/usr/bin/chromium`；临时校验镜像已删除。
- 下一步：后续发布时继续按本地/CI 构建、服务器只 `docker load` / `docker compose up` 的主路径执行；如果同机内存紧张，优先降低 `ERP_PDF_RENDER_CONCURRENCY`，再评估是否调整 `APP_MEM_LIMIT`。
- 阻塞/风险：本轮不改 PDF HTML 快照、打印模板字段、业务数据、schema 或线上服务；观测性仍沿用 `/templates/render-pdf` 既有 handler、span 与结构化日志，本轮未新增 HTTP 入口。当前工作区还存在本轮前的 `web/Dockerfile`、`web/scripts/serveStaticApp.mjs` 等未提交现场，本轮未回退也未纳入 PDF/Chrome 迁移验收。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-08 23:59
- 完成：按低配服务器发布口径补充部署构建边界，更新 `AGENTS.md`、`docs/deployment-conventions.md`、`server/deploy/README.md` 和 `server/deploy/compose/prod/README.md`，明确服务器只负责加载已构建镜像、启动 Compose、执行 migration 与部署后检查；服务端/前端镜像必须先在本地或 CI 构建并上传。
- 下一步：后续如补发布脚本，可继续把该规则做成脚本级 preflight，检测到远端执行构建命令时直接阻断。
- 阻塞/风险：本轮只更新正式部署口径和协作规则，未触达运行时代码、schema、Compose 配置或线上服务；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-06 22:52
- 完成：将本项目后端默认端口从 `8200 / 9200` 收口到 `8300 / 9300`，同步更新 dev/prod 配置、Compose 默认反代与映射、Docker 暴露端口、`server` dev 清理端口、前端 Vite 代理、真实登录回归默认后端地址，以及 README、后端运行/配置文档和前端帮助文档口径；本轮未涉及 schema、migration 或业务字段真源。
- 下一步：后续启动本项目后端前，先确认 `8300 / 9300` 未被其他本机服务占用；若已有外部 `.env` 或线上网关配置，需按同一端口口径同步调整。
- 阻塞/风险：当前仓库内历史进度记录仍保留旧端口作为历史流水，不作为当前部署真源；本轮尚未启动后端或执行完整前后端测试。

## 2026-05-03 21:33
- 完成：提交毛绒 ERP 当前系统层与业务表单推进现场。前端补齐客户/供应商/产品主档选择与快照字段、业务模块表单布局、帮助中心文档入口、系统层进度与产品化交付文档；服务端同步推进 RBAC、工作流与调试种子相关边界。主档字段当前真源为基础资料模块，业务单据保存快照用于回显和后续流转，表单选择器负责带值与清值。
- 下一步：继续围绕主档选择器、业务单据快照和移动端任务权限做字段链路回归；若后续触达保存或打印链路，需要继续覆盖“选择新主档覆盖旧快照 / 清空主档清值 / 快照缺失不伪造值”。
- 阻塞/风险：本轮属于毛绒 ERP 初始化推进，仍有部分产品化文档和系统层功能处于演进中；当前提交不代表业务模型已经最终冻结。

## 2026-05-03 18:41
- 完成：收紧 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 中的 `progress.md` 归档规则，明确每次更新前先检查规模；达到或超过 `600` 行或 `80KB` 时，必须先显式归档旧记录再追加本轮记录，并禁止通过 pre-commit、pre-push 或后台脚本静默自动改写。本轮只更新协作规则和本进度记录，不改变毛绒 ERP 正式口径、数据模型草案、部署配置、运行时代码或既有变更文档。
- 下一步：后续更新 `progress.md` 时按 `600` 行 / `80KB` 双阈值执行；阶段完成或历史内容影响查找时，可提前人工归档。
- 阻塞/风险：当前工作区仍有其他业务改动未纳入本轮规则提交；本轮未回退、整理或验证这些业务改动。

## 2026-05-03 18:05
- 完成：将 `progress.md` 人工归档规则写入 `/Users/simon/projects/plush-toy-erp/AGENTS.md`，明确进度文件只作为过程流水和交接线索，不作为当前正式需求、数据模型或部署真源；禁止定时自动清空，改为在文件明显过大、阶段完成或历史内容影响查找时人工归档。本轮未执行实际归档，也未创建 `docs/archive/`，原因是当前 `progress.md` 只有少量近期记录，且 `docs/changes/plush-erp-bootstrap-init.md` 仍是 `in_progress` 活跃变更。
- 下一步：等阶段完成或 `progress.md` 明显变大后，再按规则把旧流水移动到 `docs/archive/progress-YYYY-MM.md`，并同步更新 `docs/README.md` 的归档入口。
- 阻塞/风险：本轮只更新协作规则与进度记录，不改变毛绒 ERP 正式口径、数据模型草案、部署配置、运行时代码或测试样本；当前工作区已有大量业务改动，本轮未回退或整理。

## 2026-04-21 00:26
- 完成：把本地开发数据库真源从误配的 `127.0.0.1:5435/plush_toy_erp` 收口到共享 PG `192.168.0.106:5432/plush_erp`。已同步更新 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml`、`/Users/simon/projects/plush-toy-erp/server/configs/dev/config.local.example.yaml`、`/Users/simon/projects/plush-toy-erp/server/cmd/dbcheck/main.go`、`/Users/simon/projects/plush-toy-erp/server/Makefile`、`/Users/simon/projects/plush-toy-erp/server/docs/*` 和根 README，避免后续再把 Compose 宿主机映射 `5435` 误当成日常开发默认 DSN。
- 完成：补充正式数据模型草案 `/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`，明确当前 `server/internal/data/model/schema/*.go` 只有 `users / admin_users` 两张账号表，只能算登录基线，不应误判为毛绒 ERP 的正式业务表设计；同时给出首批更适合毛绒工厂的实体建议，并明确当前不应照搬旧外贸主表，也不应先上 `erp_module_records` 这种泛 JSON 真源。
- 验证：本轮还未直连 `192.168.0.106` 做库创建或授权校验，因为当前会话没有 `zos_test_user / test_user` 的密码；只确认了客户端报错是 `fe_sendauth: no password supplied`，因此“你在 PG 客户端看不到该库”的剩余分支只可能是 `1)` `plush_erp` 还没在 `192.168.0.106` 创建，或 `2)` 当前登录账号尚未被授予该库的 `CONNECT` / 建表权限。

## 2026-04-20 23:58
- 完成：参考旧外贸项目的信息架构经验，为 `/Users/simon/projects/plush-toy-erp` 新增毛绒 ERP 初始化壳层，落地 `web/src/erp/` 的主路由、初始化看板、流程总览、帮助中心、文档页、资料准备页和角色移动端工作台；管理员登录后的默认入口已切到 `/erp/dashboard`，旧的通用 `AdminMenu / AdminGuide / AdminHierarchy` 页面已从路由移除并删除，避免继续被误认成真源。
- 完成：新增正式文档与接力材料，包括 `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`、`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`、`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`，并同步更新根 `README.md`、`web/README.md`、`docs/README.md`、`docs/project-status.md`、`docs/current-source-of-truth.md`，把当前边界明确为“先初始化流程、帮助中心、文档、移动端；拍照扫码和正式 Excel / 合同打印后置”。
- 完成：统一端口口径，`server` 默认 HTTP / gRPC 端口收口到 `8200 / 9200`，PostgreSQL 宿主机映射默认改为 `5435`，并同步更新 `server/configs/*`、`server/deploy/compose/prod/*`、`server/docs/*`、`server/Dockerfile`、`server/cmd/dbcheck/main.go` 与 `server/Makefile` 示例。
- 完成：执行验证 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test && pnpm build && pnpm style:l1`、`cd /Users/simon/projects/plush-toy-erp/server && go test ./...`、`bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict` 全部通过，其中 `style:l1` 已覆盖公共首页、管理员登录、ERP 看板、帮助中心、移动端工作台和资料准备页共 `8` 个场景。
- 下一步：等更多合同 / Excel / 移动端样本到位后，优先把字段真源、导入链路和打印模板挂到当前 `docs/changes/plush-erp-bootstrap-init.md` 的主路径里继续做，不要回退到旧外贸业务模型上补丁。
- 阻塞/风险：本轮只初始化了前端信息架构、文档与配置口径，还没有接真实业务实体、Excel 导入、合同打印或扫码链路；相关入口目前都明确标成“待资料接入 / 本轮暂缓”，不应误判为已经交付。

## 2026-04-19 11:18
- 完成：继续收紧 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的工程原则，移除“先理解现状，再做最小必要改动”这句容易引发误读的表述，改为“先确认真源与主路径，再决定改动范围；改动应完整解决当前问题，最小化的是无关影响和额外复杂度，而不是靠局部补丁或 fallback 蒙混过关”。
- 下一步：后续若该仓库出现多来源字段、导入回填、打印映射或多主路径部署场景，可再按实际问题继续细化专项约束；当前工程原则层面已把“完整修主路径”讲清楚。
- 阻塞/风险：本轮仍然只更新协作文档，没有触达运行时代码和测试；剩余风险主要来自后续执行时是否严格按新口径落地，而不是文案本身。

## 2026-04-19 18:40
- 完成：更新 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的 Git 约定，明确“默认不要用 `git stash` 隐藏主工作区现场；若误用 stash，必须同轮盘点、恢复唯一内容并清理”。后续该仓库若需要隔离脏工作区，优先 `git worktree` 或按路径精确提交/检查，不再把 stash 当默认中转层。
- 下一步：若后续该仓库真的出现“主工作区很脏但只想提交一小部分”的现场，按这次新规则直接用 worktree 或精确 stage，不再临时造 stash。
- 阻塞/风险：本轮只更新协作文档，没有触达运行时代码、测试或部署脚本；剩余风险主要是执行层是否严格遵守，不是文案本身。

## 2026-04-19 11:15
- 完成：更新 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的工程原则，补充“定位或修复时先确认当前真源与主路径，并优先做完整且最简洁的主路径修复”的明确约束，避免把“最小必要改动”误读成局部最小补丁、临时兜底或 fallback 式修补。
- 下一步：后续若 `plush-toy-erp` 增加更复杂的交接、部署或多主路径约束，可再按实际场景扩展项目级 `AGENTS.md`；当前这条已足够覆盖本轮歧义。
- 阻塞/风险：本轮只更新协作文档，没有触达运行时代码、部署脚本或测试；旧外贸项目与 `webapp-template` 未同步改动，因为它们已有更强的真源/主路径约束，重复添加只会增加噪音。
