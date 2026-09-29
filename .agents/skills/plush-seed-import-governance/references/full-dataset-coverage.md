# Full Dataset Coverage / 完整模拟数据覆盖

本引用回答两个问题：当前承诺范围内怎样算“造全”，以及代码变化后哪些数据需要复用、重验或重造。当前阶段名、数量和依赖以 `scripts/qa/manual-acceptance-dataset*.mjs`、业务链合同和测试为准，本文不保存会漂移的统计数字。

## 先读当前合同

按本次目标只读取需要的真源：

- 业务链、步骤、岗位、状态、Fact 与场景：`scripts/qa/manual-acceptance-business-chain-contract.mjs` 及其来源 catalog。
- 造数阶段、registry、入口、逻辑指纹文件和回执：`scripts/qa/manual-acceptance-dataset.mjs`、`scripts/qa/manual-acceptance-dataset-runner.mjs`。
- 页面数据前置与 readiness：`scripts/qa/manual-acceptance-page-data-contract.mjs`、`scripts/qa/manual-acceptance-readiness.mjs`。
- profile、目标与长期/隔离批次边界：测试数据中心实现、目标 policy 和正式文档。

如果这些真源与本文示例冲突，以代码、测试和当前运行回执为准。

## “造全”的完成标准

“造全”只覆盖当前产品已经支持且纳入本轮验收的能力，不按通用 ERP 清单虚构模块。每条纳入范围的业务链至少要有一组能跨页面对账的场景，组合覆盖：

| 维度 | 必须证明的内容 |
| --- | --- |
| 业务关系 | 主单、明细、来源、任务、Fact、附件等对象能追溯到同一批业务 |
| 生命周期 | 当前合同允许的正常流转、已完成结果、取消/冲正/调整等必要边界 |
| 岗位与权限 | 责任岗位能看见并办理，非责任岗位不能越权；不能从账号名猜角色 |
| 数量与单位 | 数量、单位、精度、分批、余额和派生结果能按业务口径对账 |
| 列表与查找 | 关键筛选、搜索、分页、空状态和边界记录有足够数据可验证 |
| 证据边界 | Workflow 完成与 Fact 入账分开，模拟结果不冒充客户真实事实 |

优先构造贯穿多个岗位和页面的一条完整链，再补必要边界；不要为每页放一组互不关联的空壳记录。

## 场景配方

新增或修改场景前先写清以下字段，再映射到现有阶段：

| 字段 | 内容 |
| --- | --- |
| `goal` | 该场景要验证的业务结论 |
| `source_basis` | 来自正式业务合同、已脱敏客户观察，或为覆盖而设计 |
| `preconditions` | 所需主数据、来源单、状态、岗位和权限 |
| `operations` | 通过哪些正式 usecase/API/runner 操作构造 |
| `relations` | 跨页面对象如何关联、哪些稳定编码用于读回 |
| `expected_facts` | 最终必须存在或明确不得存在的 Fact 与数量关系 |
| `role_views` | 哪些岗位能看见、办理或只读 |
| `edge` | 精度、分批、空值、失败、重复执行等边界 |
| `readback` | API、页面、查询和测试分别证明什么 |
| `cleanup` | 专用库清理、长期批次退出或冲正路径 |

## 模块和依赖

阶段 registry 是执行真源。当前结构把身份/基础核对、基线、岗位、来源、任务、Fact、采购质检、附件和 readiness 分开；具体 key 和依赖必须从代码读取。

修改造数逻辑时同时完成：

1. 将逻辑放进唯一负责的阶段入口或其 helper，避免跨阶段复制同一业务映射。
2. 把所有会改变该阶段输出的源码、合同或常量文件登记到 `MANUAL_ACCEPTANCE_DATASET_STAGE_LOGIC_DEPENDENCY_FILES`。
3. 如果该阶段输出是其他阶段的输入，更新 `MANUAL_ACCEPTANCE_DATASET_STAGE_DEPENDENTS`。
4. 更新“指纹隔离”和“直接变化阶段只刷新依赖闭包”的回归测试。
5. 让回执列出 `logicChangedStages`、`dependencyRefreshedStages`、`reusedStages` 与最终 `refreshedStages`。

仅增加文档描述或页面样式时，不应伪造一个阶段变化来强迫重造。

## 复用、重验和重造

先比较目标身份、migration、组件 digest、业务链数据摘要、验证摘要和阶段逻辑指纹，再决定动作：

| 变化 | 决策 | 动作 |
| --- | --- | --- |
| 数据摘要与验证摘要均未变，阶段指纹未变 | `reuse` | 复用未变化组件；仍实时核对 target、core 和 readiness |
| 只有验证摘要、断言、页面验收或证据引用变化 | `reverify` | 保持当前 dataVersion 和同批数据，重跑相关合同、readiness 与浏览器验证 |
| 某阶段入口、helper、常量或登记依赖文件改变 | `reseed` | 刷新直接变化阶段，并按依赖图刷新消费者 |
| 业务链的数据结构、状态、单位、数量合同或稳定编码改变 | `reseed` | 先在隔离批次验证；能证明模块影响时局部刷新，不能证明时刷新完整业务阶段 |
| migration 改变 | `reseed` | 按 runner 规则刷新 baseline 及后续阶段，不能用旧空库结果代替现库升级证据 |
| 只有 UI、样式、文案、性能或 release SHA 改变 | `reuse` | 不重造业务数据；绑定新 operation 做所需页面/发布验证 |
| 目标身份、回执、组件 digest 或范围漂移 | `stop` | 停止复用和写入，重新 plan 或报告阻断 |
| 相对时间快照过期 | `reseed` 或 `stop` | 只通过受控 runner 刷新时间相关模块及依赖；不直接改库“续期” |

`dataVersion` 只在业务语义不兼容或冻结下一轮试用基线时升级，不随每次提交、operation 或局部重验递增。

## Profile 边界

- `core-demo` 只准备登记账号和基础主数据，不承担业务场景。
- `scenario-demo` 是长期模拟业务批次，允许按阶段指纹和依赖闭包增量续跑。
- `full-acceptance` 每次使用隔离批次按当前完整合同回归，并完成自动清理读回。
- 非业务客户测试目标只运行正式 allowlist 的基础 bootstrap；不得因为存在 demo runner 就写入订单、库存、出货或财务数据。

## 最小行为评估

修改本 Skill、阶段 registry、指纹或依赖图后，至少用以下输入检查行为：

1. 纯 UI 改动：应复用业务数据，不触发造数。
2. 只改浏览器断言：应重验，不升级 dataVersion。
3. 只改 Fact 生成逻辑：应刷新 Fact 及登记消费者，其他阶段复用。
4. 新增阶段 helper 却未登记指纹依赖：应在 review/测试中被识别为不完整。
5. migration 改变：应刷新基线和后续阶段。
6. 回执 digest 被改写或目标不匹配：应停止，不能自动补写。

完成回执必须绑定 target、migration、dataVersion、run id、exact source identity、直接变化模块、依赖刷新模块、读回和恢复路径；“脚本执行结束”本身不是完成证据。
