# ERP 前端配置 / ERP Frontend Config

本文是 `web/src/erp/config/` 的目录入口。前端运行、构建和登录入口说明仍先看 [web/README.md](../../../README.md)；当前业务真源、Workflow / Fact / RBAC 边界仍回到 [docs/当前真源与交接顺序.md](../../../../docs/当前真源与交接顺序.md)、后端 usecase、JSON-RPC 和测试。

## 目录职责

`web/src/erp/config/` 只维护前端可见配置、导航定义、dev-only 入口、测试入口、字段 / 打印 / 状态展示映射和客户配置投影消费侧 helper。它不替代后端 RBAC、active customer config revision、Workflow / Fact usecase、schema、migration 或 release evidence。

## 主要分组

| 分组           | 典型文件                                                                                                                            | 职责                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 正式入口与菜单 | `seedData.mjs`、`menuPermissions.mjs`、`businessModules.mjs`、`appRegistry.mjs`、`entryConfig.mjs`                                  | 桌面菜单、岗位入口、权限码映射和登录入口展示            |
| 客户配置投影   | `customerMenuConfig.mjs`、`devCustomerConfig.mjs`、`devCustomerConfigRoute.mjs`                                                     | 消费静态客户外观 / 菜单候选和 dev-only 客户配置预检入口 |
| dev-only 导航  | `devHub.mjs`、`devRoutes.mjs`、`devDocs.mjs`、`devTesting.mjs`、`devGovernance.mjs`、`devPrototypes.mjs`、`devCapabilityLedger.mjs` | `/__dev/*` 本地治理、文档、测试、原型和能力真源入口     |
| 展示配置       | `commandCenter.mjs`、`dashboardModules.mjs`、`workflowStatus.mjs`、`printTemplates.mjs`                                             | 工作台、看板、Workflow 状态和打印模板字段预检展示       |

## 边界

- 前端隐藏菜单、按钮或字段不是安全边界；后端仍按 RBAC、active module states、业务状态机、Workflow / Fact usecase、幂等和审计决定是否允许写入。
- `seedData.mjs` 和 `menuPermissions.mjs` 是前端导航 / 权限码消费层，不新增后端权限语义；新增敏感动作应先有后端权限码和 JSON-RPC 守卫。
- `customerMenuConfig.mjs` 的静态客户配置只控制候选品牌、菜单和展示，不代表 active customer config revision 已发布或已生效。
- `dev*` 文件只服务 `/__dev` 本地开发态入口，不进入正式 ERP 菜单、seedData、RBAC、生产构建或后端业务。
- 配置文件里的测试通常锁住展示合同和入口边界，不证明目标环境 release evidence、真实账号 RBAC 或客户验收完成。

## 修改后验证

按影响面选择最小命令：

```bash
node --test web/src/erp/config/seedData.test.mjs
node --test web/src/erp/config/menuPermissions.test.mjs
node --test web/src/erp/config/entryConfig.test.mjs
node --test web/src/erp/config/devHub.test.mjs
node --test web/src/erp/config/devTesting.test.mjs
git diff --check
```

若改动正式菜单、岗位入口、客户配置投影或 dev-only 文档 / 测试入口，还应补对应 `scripts/qa/*` 守卫和 `web/README.md` / 正式文档口径检查。
