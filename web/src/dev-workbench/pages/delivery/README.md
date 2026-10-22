<a id="交付运行页面"></a>

# 交付运维页面

[交付总览](../DevWorkbenchAreaPage.jsx)负责选择任务；[数据库迁移](../DevDatabaseMigrationPage.jsx)、[版本发布](../DevVersionCenterPage.jsx)和[安全与恢复](../DevDrillRecoveryPage.jsx)各自组织范围、当前操作与结果。客户配置沿用相邻的[客户配置模块](../customer-config/README.md)。

| 模块                                             | 责任                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `DeliveryWorkspace.jsx`                          | 按发布上线、日常维护组织四类任务入口；发布顺序按需查看，环境名称来自目标登记表 |
| `DeliveryTaskPath.jsx` / `delivery-workflow.css` | 编号路径、来源明确的节点状态和页面局部布局                   |
| `migration/`                                     | 状态读取与动作生命周期、升级路径、运行检查、记录、确认与详情 |
| `version/useVersionCenterRoute.jsx`              | URL 视图、历史筛选与前进后退                                 |
| `version/useVersionCenterState.jsx`              | 客户范围、只读快照、发布会话、请求保护和写动作               |
| `version/useOperationHistory.jsx`               | 全部留存操作的服务端分页、筛选、统计及过期请求保护           |
| `version/OperationEvidence.jsx`                 | 目标检查回执、迁移与恢复范围、源码和 CI/CD 追溯链接          |
| `version/buildVersionCenterModel.mjs`            | 复用正式合同计算制品、目标、发布资格与操作详情               |
| `version/` 其他模块                              | 版本与记录列表、当前任务、制品发布、部署确认和操作详情       |
| `recovery/`                                      | 核验数据生命周期、安全清单、计划演练、应急步骤和只读详情     |

编号用于真实的办理顺序。数据库节点只展示已有证据给出的状态；普通导航和阅读不会产生完成证据。安全核验、恢复演练与应急处置是不同任务，保持平级视图。

各页保留当前目标、严重阻塞、未结束操作及刷新状态。发布制品、准备部署计划和确认执行各有入口，已有确认短语、权限、CAS、目标隔离、回滚资格与结果读回继续由正式接口守住。本页重组不新增服务器、数据库或任意命令输入。

默认画面保留判断与动作：环境表并排比较运行、候选、数据和验收状态，下一步常显，完整证据在原行展开；最近工作台操作放在环境表后。安全清单保留状态与短动作，点击动作展开完整核验要求；演练清单保留优先级、状态与风险，目的和频率在已有详情查看。版本列表只显示适用的部署或回滚操作，制品时间、大小与缓存合并到“制品信息”；发布检查保留结论，成功项细节按需查看。迁移当前步骤和确认常显，已完成的上次升级默认收起。

配置包检查保留项目、结果及阻断原因，范围说明合并为一个按需入口。 客户配置只保留顶部任务导航，报告合并为一个详情入口；演练名称直接查看详情，当前建议在原行标记。迁移准备与恢复按当前视图和状态提供；未开放动作使用说明，发布范围在确认弹窗一次讲清，不重复创建空操作或解释浮层。

状态读取失败时保留可用的历史证据，并停用依赖新鲜证据的写操作；未读到版本或目标不能解释为不存在。安全检查缺少专门回执仍显示未核验，数据库恢复回执只证明自身范围。

## 验证

1. 运行 `devDelivery`、`devDatabaseMigration`、`devRecovery`、`devHub`、`devTimestamp` 和相关样式合同测试。静态合同通过 `web/scripts/test/pageSources.mjs` 读取实际页面模块，避免拆分后漏查。
2. 在 `web/` 定向运行 `dev-delivery-task-navigation-desktop`、`dev-database-migration-workspace-desktop`、`dev-version-center-tabs-pagination-desktop`、`dev-drill-recovery-desktop-light` 浏览器场景。保留原有确认、失败恢复、记录、切换动效与焦点测试，并核对编号、状态与标题对齐和窄屏溢出。
3. 对本目录和四个入口执行 ESLint、局部 CSS 检查及 workbench 构建。浏览器使用隔离夹具，不执行实际目标发布、迁移或恢复。

正式交互与执行边界见[研发效能工作台与 CI/CD 设计](../../../../../docs/engineering/研发效能工作台与CI-CD设计.md)。

GitLab 原生任务明细与日志沿链接查看；工作台保留项目汇总、检查及操作入口。部署详情展示 GitLab 环境和回执归档引用，历史补录保留原始时间；“补录 GitLab”只调用终态记录同步，不重复部署。协议与恢复入口见 [部署登记](../../../../../scripts/deploy/README.md#gitlab-部署登记与回执归档)。
