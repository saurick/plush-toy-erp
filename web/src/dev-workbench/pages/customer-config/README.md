# 客户配置页面模块

页面入口是 [DevCustomerConfigPage.jsx](../DevCustomerConfigPage.jsx)。它组织客户范围、常驻步骤导航、当前面板和前后操作；本目录按任务与副作用拆分，不定义客户包、权限或发布状态的第二套真源。

| 模块                                            | 责任                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `navigation.mjs` / `useCustomerConfigRoute.mjs` | 五步路径、既有 URL 参数的规范化、深链与历史恢复                  |
| `OverviewPanel.jsx` / `DiffPanel.jsx`           | 工作区状态、配置到部署的关系、产品默认与候选包的比较             |
| `PreflightPanel.jsx` / `AssetsPanel.jsx`        | 配置范围检查、菜单与字段、编号和打印预览                         |
| `RuntimeSettings.jsx` / `ReviewEvidence.jsx` | 模块候选状态与覆盖、工作区校验结果和评审依据 |
| `CustomerConfigFieldGuide.jsx` / `CustomerApprovalPolicy.jsx` | 读取通用字段说明与正式审批规则，按字段或分支核对，不修改配置 |
| `CustomerConfigTrace.jsx` | 在选中字段、流程、策略和扩展旁展示声明、产物位置与使用处 |
| `CustomerPackageDiagram.jsx` / `CustomerPackageContents.jsx` | 包内配置及去向；展开后端配置和品牌菜单，直达策略与扩展 |
| `CustomerStrategyReview.jsx` | 列出策略草案，选择发布候选流程，按当前条目显示定义和来源 |
| `CustomerExtensionRegistry.jsx` | 扩展候选、声明受阻、空登记与来源 |
| `ValidationPanel.jsx` / `ReleasePanel.jsx`      | 样本试跑、本地配置应用、正式发布检查与执行器交接                 |
| `CustomerConfigPath.jsx` | 办理去向及已知状态的一行展示 |
| `useCustomerConfigOperations.mjs`               | 受控 Bridge 会话、只读历史与批次、试跑和发布检查、请求清理       |
| `useCustomerConfigTestApply.mjs`                | 管理员确认、后端校验、发布身份检查、CAS 切换和有效配置读回       |
| `*Summary.jsx` / `presentation.jsx`             | 操作反馈、证据时间、明细、状态标签和共享展示单元                 |
| `customer-config-workflow.css`                  | 本页步骤、范围、交接与对齐的布局；控件外观及动效仍由共享组件负责 |

## 交互与证据边界

步骤按“检查配置 → 核对变化 → 预览界面 → 测试验证 → 发布交接”组织，编号表示办理顺序；浏览过步骤不表示检查通过。总览常显配置来源与上线交接流程；状态只反映工作区配置、本次操作或明确标记的历史记录，不推测测试服、正式服的有效配置。

「包结构」直接显示配置数量、使用去向与结构检查结论。后端配置、品牌与菜单可原位展开取值；关闭后焦点回到触发项。流程策略与评审草案、扩展登记两行各自直达对应页签，空登记直接可见。「运行设置」默认显示全部候选模块与打印默认方，客户覆盖优先、计数合成短行；编译范围按需查阅。「评审依据」直接显示校验、预检和人工评审；[通用字段说明](../../../../../config/schemas/README.md)、边界、命令和来源集中在技术依据。「核对变化」同表比较全部模块与列表字段，覆盖项优先。

「流程策略」直接列出草案名称，发布候选流程单独选择；按当前条目显示一张图，两类内容各自显示空状态。产品通用审批规则单独查阅。「扩展登记」始终可打开：有声明时显示候选及校验状态，无声明时直接显示「暂无扩展登记」。配置生效按目标读回回执核对。

字段说明逐行展开「追溯」；流程策略查看「当前条目的来源与清单」，扩展登记在当前条目原位查阅。发布 JSON 路径描述编译合同，不是已发布记录；前端品牌与菜单显示部署 JS，评审草案标明不会执行。当前声明片段只展示允许的字段，不读取目标环境或完整清单。

「预览界面」默认展示品牌、全部菜单分组和页面、字段候选、编号规则和打印模板清单；菜单标识可一次显示，打印的完整字段和要求从对应行打开。

样本试跑和本地配置应用分别展示输入、处理与产出；前者只生成评审报告，后者写登记开发库。发布按证据批次、当前检查、执行器交接展示状态；所有实际阻断直接可见，证据详情按需查阅。正式配置由受控执行器应用并读回，服务器制品部署在版本发布中心完成。

历史发布检查必须匹配所选批次，且只显示为历史记录。本次检查通过后才开放执行器模板；切换批次立即使上一批次的成功失效。未完成的旧读取不能覆盖新操作，离开页面会中止浏览器请求并忽略迟到结果；这不撤销后端已接收的写操作。

稳定深链继续使用 `view=overview|preflight|diff|assets|import`、`section=package|runtime|flow|extensions|evidence`、`action=dry-run|test-apply|release` 与 `release`。第五步使用既有 `view=import&action=release`，不新增后端动作。

## 验证入口

1. 页面行为与原有发布、切换合同：`node --test web/src/dev-workbench/pages/DevCustomerConfigPage.test.mjs web/src/dev-workbench/config/devCustomerConfig.test.mjs web/src/erp/api/customerConfigTransition.test.mjs`。
2. 浏览器回归：在 `web/` 运行 `STYLE_L1_SCENARIOS=dev-customer-config-workspace-desktop pnpm style:l1`，核对步骤动效与对齐、失败恢复、确认取消、刷新、批次失效、未知客户和桌面溢出。
3. 只对本页与本目录执行 ESLint、CSS 检查，并构建 workbench；浏览器夹具不执行真实配置写入或发布。

架构与运行合同见[研发效能工作台与 CI/CD 设计](../../../../../docs/engineering/研发效能工作台与CI-CD设计.md#客户配置包预检与发布-__devcustomer-config)。
