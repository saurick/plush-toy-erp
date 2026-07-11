# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-11 手工回归数据与发布收口

完成：等待其它 Codex 任务全部结束后接管完整工作区。开发库已应用到 migration `20260710150001`，并通过正式 `customer_config` JSON-RPC 发布、激活 `yoyoosun-customer-package-v7.runtime-manifest-v1`，生产模块恢复为 enabled。四类模拟入口统一携带稳定 `customer_key=yoyoosun`；采购 / 质检矩阵使用中文“【手工测试】”名称，业务事实矩阵新增客户真源参数，并保留生产、委外、出货、财务的草稿 / 已过账 / 已取消 / 已结清以及库存预留 ACTIVE / RELEASED 状态。本地已生成三批采购质检、三批岗位任务和三批完整业务事实矩阵；API 读回确认销售 32、采购订单 46、采购入库 15、质检 16、生产 16、委外事实 16、库存预留 18、出货 16、财务 24、Workflow 模拟任务 118 条，主要生命周期状态均有覆盖。

完成：真实页面核对发现客户配置 role matrix 已更新而浏览器 smoke 仍使用旧硬编码菜单，已改为直接读取 `yoyoosunRoleFlowMatrix`；系统权限页不再被客户业务页面投影误过滤，客户配置仍不能放宽其 RBAC；权限清单按稳定模块 key 渲染，消除多个“未登记权限模块”的 React 重复 key。真实浏览器回归最终通过 10 个桌面账号、9 个岗位任务端和 1 个无权限拒绝态；采购页面实际显示三批中文测试订单及草稿、已提交、已审核、已关闭、已取消五种状态。

完成：使用 Node `24.14.0` / pnpm `10.13.1` 通过 `scripts/qa/full.sh`、`scripts/qa/strict.sh`、真实账号浏览器 smoke，以及 5 个受影响 L1 场景；前端全量单测 / 构建、后端全包、隔离 PostgreSQL 关键事务、Atlas / 文档 / secrets / shell / 漏洞门禁均通过。

下一步：提交并推送完整工作区；随后按 `server/deploy/compose/prod` 的低配服务器流程在本地构建镜像、上传并部署 192.168.0.133，应用 migration 和 v7 客户配置，重置测试角色账号，向 133 写入同等中文场景矩阵，并完成页面 / API / 数据库与短信 provider 配置回归。

阻塞/风险：本地数据已完成，但 133 尚未执行本轮部署和补数；目标环境发布前仍需备份、migration preflight、保留 `.env` 中短信 provider 配置并验证真实健康状态。模拟数据只用于测试人员和甲方员工手动回归，不代表真实客户导入或客户业务事实。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前收口所有工作区改动；不得回退其它已完成任务的前后端、migration、文档或测试现场。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本机构建产物、执行 migration、Compose 重启和部署后回归。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
