---
name: plush-seed-import-governance
description: 数据准备、模拟场景与导入（plush-toy-erp）；验收目录、检查与签收编排使用验收治理。Use for modular seed/fixtures/demo data, customer-source-to-synthetic mapping, incremental reuse, import dry-runs, batch identity, cleanup and customer-data boundaries.
---

# Plush Seed / 导入治理 Seed Import Governance

用这个 skill 处理 `plush-toy-erp` seed data、fixtures、demo data、import dry-runs、manual-test data 和 cleanup，保证数据可查、可回收、可增量复用且不冒充产品真源。

## Truth Routing / 真源路由

- 范围、数据入口或模块责任不清时，才用 `README.md` 与 `docs/当前真源与交接顺序.md` 定位；否则直接读取相关 module docs、代码和测试。
- 写数据前确认 target DB/env、schema/migration state、run id/prefix 和 cleanup path。
- 登记整批模拟数据的“怎么造全、哪些变化需要重造”读取 [Full Dataset Coverage](references/full-dataset-coverage.md)；普通单测 fixture 或单模块 seed 直接使用对应测试、helper 或 runner，不加载整批验收合同。“怎样从甲方资料提取业务特征并生成脱敏模拟场景”读取 [Customer Source to Synthetic](references/customer-source-to-synthetic.md)。
- 当前阶段、依赖、业务链、场景、页面和数量必须从 runner、合同与测试读取；Skill 只保存判断方法，不复制会漂移的当前统计。

## 项目规则 Project Rules

- 试用模拟只使用 seed、fixture 或手工构造数据；当前没有可直接导入的 yoyoosun 真实客户数据。
- 模拟数据不得写成真实导入、客户字段确认、出货、库存或财务事实。
- seed/import 要可定位、可回收、可复跑；不要污染 Product Core、RBAC 或长期 schema。
- 正式业务数据只能通过现有 Go repository/usecase/API 或登记 runner 构造；不得用临时 SQL、浏览器脚本或直接复制表行补齐场景。
- 登记整批 runner 的造数逻辑按现有阶段模块维护。新增或修改其中的阶段入口、helper、常量或合同文件时，把影响文件登记进阶段逻辑指纹，并维护依赖图与回归测试；普通 fixture 沿用所属测试的构造和隔离机制。
- 纯 UI、样式、文案、性能或 release SHA 变化不触发业务重造。验证合同变化只重验；数据合同或阶段逻辑变化只刷新直接变化模块及登记依赖闭包；无法证明局部影响时再扩大到完整业务阶段。
- 需要编排跨页面人工验收目录、岗位账号/任务、附件、source-driven Fact、readiness、浏览器/PDF、目标试用或退出清理时，使用 `$plush-manual-acceptance-governance`；本 skill 负责数据来源、批次和写入/回收边界。

## 工作流 Workflow

1. 定义用途和数据范围：单测 fixture、单模块 seed、登记整批模拟数据、导入演练、初始化或清理；人工验收编排切到 `$plush-manual-acceptance-governance`。
2. 确认来源、允许写入和隔离/恢复边界。实际访问数据库或服务时再核对 target environment、migration 与所用批次身份；纯内存 fixture 不要求运行环境凭据。
3. 普通 fixture 或单模块 seed：复用所属测试/helper/runner，验证需要的关系、正常与边界状态及清理。只有被登记整批 runner 消费的共享构造逻辑变化，才补查对应阶段影响；不为独立 fixture 新建 profile、dataVersion 或阶段回执。
4. 登记整批模拟数据：读取当前业务链摘要、验证摘要、阶段 registry / fingerprint / dependency 和上一批回执，形成 `reuse / reverify / reseed` 判断。`reseed` 按直接变化模块和登记依赖闭包刷新；`reverify` 保留同批数据并重跑相关合同、readiness 与浏览器验证；`reuse` 仍实时核对 target、core 与 readiness。
5. 复用现有 seed/import runner 和适用的 stable prefixes/run ids；import、清理或共享环境写入前先 dry-run / plan，不另建平行造数体系。
6. 实际写入后用 API/page/query/test 读回业务关系、状态、数量、权限与隔离，并给出 cleanup/rollback。登记整批 runner 的回执额外保留 reuse 判断以及 `reusedStages`、`logicChangedStages`、`dependencyRefreshedStages` 和 `refreshedStages`。

## 输出 Output

普通 fixture 汇报构造变化、实际测试、隔离/清理与盲区。接触环境或登记批次时，再按本次适用范围补充 target、来源、profile/dataVersion/run id、复用或刷新判断、dry-run/write/readback、影响记录及恢复路径，不填报无关批次字段。
