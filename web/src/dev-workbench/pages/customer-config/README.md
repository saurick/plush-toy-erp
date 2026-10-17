# 客户配置页面模块

页面入口是 [DevCustomerConfigPage.jsx](../DevCustomerConfigPage.jsx)。它组织客户范围、常驻步骤导航、当前面板和前后操作；本目录按任务与副作用拆分，不定义客户包、权限或发布状态的第二套真源。

| 模块                                            | 责任                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `navigation.mjs` / `useCustomerConfigRoute.mjs` | 五步路径、既有 URL 参数的规范化、深链与历史恢复                  |
| `OverviewPanel.jsx` / `DiffPanel.jsx`           | 工作区状态、配置到部署的关系、产品默认与候选包的比较             |
| `PreflightPanel.jsx` / `AssetsPanel.jsx`        | 配置范围检查、菜单与字段、编号和打印预览                         |
| `ValidationPanel.jsx` / `ReleasePanel.jsx`      | 样本试跑、本地配置应用、正式发布检查与执行器交接                 |
| `useCustomerConfigOperations.mjs`               | 受控 Bridge 会话、只读历史与批次、试跑和发布检查、请求清理       |
| `useCustomerConfigTestApply.mjs`                | 管理员确认、后端校验、发布身份检查、CAS 切换和有效配置读回       |
| `*Summary.jsx` / `presentation.jsx`             | 操作反馈、证据时间、明细、状态标签和共享展示单元                 |
| `customer-config-workflow.css`                  | 本页步骤、范围、交接与对齐的布局；控件外观及动效仍由共享组件负责 |

## 交互与证据边界

步骤按“检查配置 → 核对变化 → 预览界面 → 测试验证 → 发布交接”组织，编号表示办理顺序；浏览过步骤不表示检查通过。总览只展示工作区配置与本次操作或明确标记的历史记录，不推测测试服、正式服的有效配置。

样本试跑生成导入评审报告，本地配置应用写登记开发库，两者独立。正式发布检查只核对显式选定的证据批次；正式配置由受控执行器应用，服务器制品部署在版本发布中心完成。

历史发布检查必须匹配所选批次，且只显示为历史记录。本次检查通过后才开放执行器模板；切换批次立即使上一批次的成功失效。未完成的旧读取不能覆盖新操作，离开页面会中止浏览器请求并忽略迟到结果；这不撤销后端已接收的写操作。

稳定深链继续使用 `view=overview|preflight|diff|assets|import`、`section`、`action=dry-run|test-apply|release` 与 `release`。第五步使用既有 `view=import&action=release`，不新增后端动作。

## 验证入口

1. 页面行为与原有发布、切换合同：`node --test web/src/dev-workbench/pages/DevCustomerConfigPage.test.mjs web/src/dev-workbench/config/devCustomerConfig.test.mjs web/src/erp/api/customerConfigTransition.test.mjs`。
2. 浏览器回归：在 `web/` 运行 `STYLE_L1_SCENARIOS=dev-customer-config-workspace-desktop pnpm style:l1`，核对步骤动效与对齐、失败恢复、确认取消、刷新、批次失效、未知客户和桌面溢出。
3. 只对本页与本目录执行 ESLint、CSS 检查，并构建 workbench；浏览器夹具不执行真实配置写入或发布。

架构与运行合同见[研发效能工作台与 CI/CD 设计](../../../../../docs/engineering/研发效能工作台与CI-CD设计.md#客户配置包预检与发布-__devcustomer-config)。
