# 客户配置页面模块

[客户配置入口](../DevCustomerConfigPage.jsx)负责客户范围和三个一级页签「配置核对」「本地验证」「发布交接」。默认打开配置核对。

| 模块 | 责任 |
| --- | --- |
| `navigation.mjs`、`useCustomerConfigRoute.mjs` | 任务、核对页签、只读资料、旧深链和浏览历史恢复 |
| `CustomerConfigReview.jsx`、`DiffPanel.jsx` | 核对页签、直接可见的配置字段取值、记录条件、用途和阻断 |
| `CustomerConfigExportPanel.jsx`、`CustomerConfigDeclarationTable.jsx` | 查阅声明表格、定位 JSONC 原文和下载配置 |
| `customerConfigDeclarationExport.mjs`、`customerConfigDeclarationPreview.mjs` | 生成标准 JSON，并从同一份声明生成表格和行内注释 |
| `AssetsPanel.jsx`、`ReviewEvidence.jsx` | 界面预览、包内来源、校验、评审和字段指南 |
| `CustomerStrategyReview.jsx`、`CustomerExtensionRegistry.jsx` | 已选流程、策略草案、扩展登记和各自的只读依据 |
| `ValidationPanel.jsx`、`ReleasePanel.jsx` | 并列的本地验证入口、发布检查和执行器交接 |
| `CustomerDraftDialog.jsx` | 下载标准模板、创建独立草稿及反馈结果 |
| `useCustomerConfigOperations.mjs`、`useCustomerConfigTestApply.mjs` | 开发 Bridge 会话、操作历史、试跑、发布检查、本地身份校验与有效配置读回 |
| `customer-config-workflow.css` | 客户配置区内的布局、对比表及响应式展示 |

## 核对流程与预览界面

选择已登记的客户包后，直接切换「配置字段」「流程与策略」「扩展登记」。「配置文件位置」在字段名称右侧单独成列，记录条件跟在对应路径下。列表头的 ⓘ 用生产订单说明如何定位配置。默认只看客户单独设置，复选框旁的 ⓘ 解释筛选规则。客户没有单独设置时直接显示可用默认项。「客户包预览值」右侧的 ⓘ 解释取值。窄屏时，配置文件位置在字段名称下占一整行，两处表头说明入口位于表格上方。工作区故障在三个核对视图顶部可见。

品牌、完整菜单、字段和编号候选、打印模板的详细效果从「界面预览」查看。勾选「显示菜单代码」可查配置文件中使用的代码，旁边的 ⓘ 提供例子。校验命令、保护规则、源码及编译去向由「校验与来源」提供。

已选流程与仅评审的策略草案分别列出，按行查看产品登记定义、策略图与来源。扩展页显示候选和使用边界，空目录显示「暂无扩展登记」。目标生效以目标环境读回为准。

## 查看配置声明

在「配置核对」点「查看配置声明」。表格按源文件列出实际写入的字段、记录条件、声明值和已有说明，每页展示 20 项。用搜索按钮或回车提交关键词，搜索覆盖当前来源的所有声明。点一行的「定位」跳到 JSONC 原文，返回表格时恢复筛选、页码和定位行。

JSONC 视图保留源文件路径、键、值和层级。默认在对应字段值右侧显示说明，关闭「显示字段含义」可查看原始 JSON。「下载 JSON」保存完整的标准 JSON。系统默认值和客户包预览值在「配置字段」查看。

## 试跑、发布与历史证据

打开「本地验证」即可运行样本试跑或应用本地配置。试跑生成报告，时间、结果摘要和报告入口就近显示。应用在显式确认后写入登记开发库并读回。历史报告与本次结果各有标记。发布交接按已登记批次检查，切换批次立即清除旧成功状态。本次检查通过后可取得执行器模板。

`view=preflight&section=flow|extensions` 恢复核对页签，`detail=preview|evidence|strategy|export` 恢复预览、校验与来源、策略依据或配置 JSON。`view=import` 打开本地验证，带 `action=test-apply` 时定位本地应用。`view=import&action=release` 打开发布交接，可带 `release` 批次。切回同一客户包的配置核对时保留核对页签与字段筛选。

## 验证入口

1. 页面和配置行为通过 [Web 定向测试入口](../../../../scripts/README.md#源码测试--unit-tests)执行 `DevCustomerConfigPage.test.mjs`、`customer-config/CustomerPreview.test.mjs`、`customer-config/customerConfigDeclarationExport.test.mjs`、`config/devCustomerConfig.test.mjs`。
2. 浏览器回归使用 `STYLE_L1_SCENARIOS=dev-customer-config-json-desktop,dev-customer-config-workspace-desktop pnpm style:l1`，点验永绅和工程参考包的配置 JSON 预览与下载，以及失败重试、确认取消、批次失效和窄窗。验证和发布操作使用浏览器夹具。
3. 对本页和相关目录执行 ESLint 与 CSS 检查。运行合同见[客户配置包预检与发布](../../../../../docs/engineering/研发效能工作台设计.md#客户配置包预检与发布-__devcustomer-config)。
