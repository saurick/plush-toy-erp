# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-11 旧审查复核与新发布候选收口

完成：前序完整工作区已在 `main` 提交并推送为 `711441829c84379dc7e1d0aa65a8eaedc27350ac`，6 条新增 migration 的 exact bytes 已记录；固定 revision 的 `make data` 为零漂移。133 已按该 revision 完成备份隔离恢复、migration `20260710150001`（pending 0）、active customer config、10 个桌面账号 / 9 个岗位任务端 / 1 个拒绝态、真实短信 provider、API / DB 生命周期和浏览器回归。133 运行时 image ID 为 server `sha256:1924726f1aa7ae6013f5112338fb3d7e9ad6cd756eb067efe0bdf2c468659dcc`、web `sha256:8659526ffaf4a4b2ee9e6f839a2d582e81f4fa7ac64788028b2a30c43910a71b`，传输 bundle SHA-256 为 `92fcd72d73cda5c618d40305889ad32b55c271d363aa5dae9091f74be4a527b9`。本机 IPv6 HTTP / HTTPS LaunchDaemon 已增加 `ipv6only=1` 并重载，HTTPS 转发不再自环耗尽临时端口；未切换 Clash 节点。

完成：按当前代码、正式文档和测试逐项复核旧 ChatGPT 审查。库存预留锁、SKU 端到端、ProcessRuntime 领域命令原子边界、出货来源完整性 / 并发超发 / 预留消费、客户原始资料发布隔离、active revision fail-closed 和 super admin break-glass 均已由当前主路径覆盖，不重复实现；BOM SKU、历史空 SKU 重分类、导入自动建 SKU、自动下游回滚和新增 Product Core 页面仍按正式边界不扩张。仍合理的缺口已收敛为 PostgreSQL 关键门禁遗漏、ProcessRuntime 创建回滚缺测、Workflow 多角色资格组合、shipment 拆分写入口和目标 Chromium/PDF 运行时回归。

完成：`full / strict` 的真实 PostgreSQL 门禁现已显式启用同一个隔离库的 purchase / inventory 两组 guard，并覆盖 Inventory、OperationalFact、ProcessRuntime、Finance / Sales process command；新增采购入库创建在 durable result 冲突时，单头、明细、批次和质检全部回滚且原结果不变的 PostgreSQL 测试。Workflow owner role 现在必须由 active revision 中同一 role 的启用 profile、当前 customer scope entitlement、动作 capability 和 revoke 共同决定；固定客户缺 revision 或读取失败时 fail closed，指定 assignee、PMC / boss 催办和受审计 super admin break-glass 保持原边界。

完成：公开 `create_shipment / add_shipment_item` 头行拆分写入口已退役并固定返回 `UnknownMethod 40020`；前后端、模拟数据和 L1 统一使用严格幂等的 `create_shipment_with_items` 聚合创建，既有明细只读。133 只读盘点确认 7 张 DRAFT 均恰有 1 条明细，零明细 DRAFT 为 0，无待补数据。Debian Chromium `150.0.7871.46` 在 133 真实触发 SIGTRAP，已收敛为上游版本回归；Dockerfile 精确固定 `chromium / chromium-common 150.0.7871.100-1~deb12u1`，生产要求 `ERP_PDF_WARMUP=async`，preflight 校验运行时包版本，authenticated smoke 真实校验 HTTP 200、`application/pdf`、`%PDF` 和非空响应并只保存脱敏 hash / size。linux/amd64 本地镜像及容器内 PDF 已通过。

验证：Node `24.14.0` / pnpm `10.13.1` 下 `scripts/qa/full.sh` 与 `scripts/qa/strict.sh` 全部通过；前端 676 项测试和 production build、全包 Go test / build、shipment 两个 L1 场景、真实隔离 PostgreSQL 关键事务门禁、脚本 / 客户包 / 文档 / secrets / migration / release evidence 守卫均通过。`govulncheck` 报告当前代码调用路径受影响漏洞 0；`gofmt`、shell syntax 和 `git diff --check` 通过。全量门禁首轮还发现并清理了两处仍引用旧 shipment split builder / 按钮条件的测试残留，重跑后全绿。

下一步：在 Node `24.14.0` / pnpm `10.13.1` 下完成全量 `full / strict`，提交推送新固定 revision；从该 revision 本地构建 immutable linux/amd64 镜像，133 恢复 `ERP_PDF_WARMUP=async` 后重新部署，执行 runtime preflight、真实 PDF、账号 / RBAC、出货退役负测、页面 / API / DB smoke，并生成新的独立 release evidence 与最终 GO / NO-GO。

阻塞/风险：旧 `7114418` 目标运行态为了从 Chromium `.46` 故障中恢复 ready 暂时使用 `ERP_PDF_WARMUP=off`，因此不是最终 release-ready 状态；必须由新 revision / `.100` 镜像和目标真实 PDF 证据替换。当前修改尚未提交推送或发布，不能把本地通过写成 133 已完成。

## 2026-07-11 手工回归数据与发布收口

完成：等待其它 Codex 任务全部结束后接管完整工作区。开发库已应用到 migration `20260710150001`，并通过正式 `customer_config` JSON-RPC 发布、激活 `yoyoosun-customer-package-v7.runtime-manifest-v1`，生产模块恢复为 enabled。四类模拟入口统一携带稳定 `customer_key=yoyoosun`；采购 / 质检矩阵使用中文“【手工测试】”名称，业务事实矩阵新增客户真源参数，并保留生产、委外、出货、财务的草稿 / 已过账 / 已取消 / 已结清以及库存预留 ACTIVE / RELEASED 状态。本地已生成三批采购质检、三批岗位任务和三批完整业务事实矩阵；API 读回确认销售 32、采购订单 46、采购入库 15、质检 16、生产 16、委外事实 16、库存预留 18、出货 16、财务 24、Workflow 模拟任务 118 条，主要生命周期状态均有覆盖。

完成：真实页面核对发现客户配置 role matrix 已更新而浏览器 smoke 仍使用旧硬编码菜单，已改为直接读取 `yoyoosunRoleFlowMatrix`；系统权限页不再被客户业务页面投影误过滤，客户配置仍不能放宽其 RBAC；权限清单按稳定模块 key 渲染，消除多个“未登记权限模块”的 React 重复 key。真实浏览器回归最终通过 10 个桌面账号、9 个岗位任务端和 1 个无权限拒绝态；采购页面实际显示三批中文测试订单及草稿、已提交、已审核、已关闭、已取消五种状态。

完成：使用 Node `24.14.0` / pnpm `10.13.1` 通过 `scripts/qa/full.sh`、`scripts/qa/strict.sh`、真实账号浏览器 smoke，以及 5 个受影响 L1 场景；前端全量单测 / 构建、后端全包、隔离 PostgreSQL 关键事务、Atlas / 文档 / secrets / shell / 漏洞门禁均通过。

下一步：提交并推送完整工作区；随后按 `server/deploy/compose/prod` 的低配服务器流程在本地构建镜像、上传并部署 192.168.0.133，应用 migration 和 v7 客户配置，重置测试角色账号，向 133 写入同等中文场景矩阵，并完成页面 / API / 数据库与短信 provider 配置回归。

阻塞/风险：本地数据已完成，但 133 尚未执行本轮部署和补数；目标环境发布前仍需备份、migration preflight、保留 `.env` 中短信 provider 配置并验证真实健康状态。模拟数据只用于测试人员和甲方员工手动回归，不代表真实客户导入或客户业务事实。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
