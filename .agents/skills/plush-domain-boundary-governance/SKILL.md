---
name: plush-domain-boundary-governance
description: 领域设计与生成（plush-toy-erp），不执行目标库迁移或发布。Use for schema/migration design, repo/usecase/API/RBAC, Workflow/Fact, Product Core and field truth.
---

# Plush 业务边界治理 Domain Boundary Governance

用这个 skill 在实现 `plush-toy-erp` 功能前收敛 domain ownership、source of truth、API/RBAC、frontend/backend responsibility 和 customer/template-specific boundary。

后端边界：这是 plush 后端业务实现前的主治理入口，覆盖 schema / migration / repo / usecase / JSON-RPC / API / RBAC / transaction / idempotency / error code / Workflow-Fact boundary。页面治理 skill 只核对可见能力是否有真实后端支撑；一旦需要新增或修改这些后端能力，应切换到本 skill。

## Truth Routing / 真源路由

- 范围、模块责任或入口不清时，才用 `README.md` 与 `docs/当前真源与交接顺序.md` 定位；否则直接读取相关 module docs、代码、schema/migration 和测试。
- 代码、schema/migrations、tests、formal docs 强于聊天规划或旧 reference notes。

## 项目规则 Project Rules

- 先按 `MasterData / Workflow / Fact / RBAC / API-UI / Productization` 分层定位责任。
- `Workflow task done` 不等于 `Fact posted`；`WorkflowUsecase` 不直接写库存、出货、财务事实。
- 单客户私有化边界遵循项目 AGENTS；SaaS 多租户、license 等只有用户明确提出并完成专项评审才可扩展，客户字段不硬编码进 Product Core。
- 后端实现先确认 schema/migration、repo、usecase、JSON-RPC/API、RBAC、transaction、idempotency、error code 和测试责任，不让前端或临时脚本承接业务事实一致性。

## 项目边界门禁 Project Boundary Gates

- 新增 schema、migration、repo、usecase、API、RBAC 权限、状态、字段或配置前，先证明现有真源不能承接，并说明新增复杂度的收益和退出边界。
- 优先主路径修复：不要用页面私有逻辑、脚本补写、兼容 fallback、重复派生字段或宽松校验掩盖 usecase / repo / API 合同缺口。
- Workflow / Fact、客户差异、字段残值 / 缺值、幂等和事务边界必须可测试、可解释、可回滚；不能只让当前 happy path 通过。
- 当前目标所需的 schema、API、UI、文档和测试按同一闭环连续完成；只排除任务外扩展，发布仍核对独立授权。

## 工作流 Workflow

1. 写出 single domain outcome 和 owning layer。
2. 找到 source-of-truth fields、states、identifiers、permissions、derived values。
3. 检查现有 table/usecase/API/helper 是否已经拥有该行为。
   查询、统计、导出、批处理或热点并发受规模影响时，按[数据规模与并发](#data-scale-and-concurrency)评估；未触及规模敏感路径的字段与文案调整不单独触发容量分析。
   涉及版本字段或模块版号时，按[版本边界](../../../docs/engineering/跨层公共契约与生成规范.md#版本边界--version-boundaries)核对独立读写需求及存量消费者，再决定删除、复用现有身份或保留必要格式版本。
   配置启动失败时先区分运行边界错误与人工版号漂移，不用递增包名或维护“当前 / 上一版”白名单解堵。配置内容身份复用现有内容 revision 生成器；同次构建的临时响应同步生产者、消费者和结构校验。新增或保留格式版本须说明真实跨发布读写者及不兼容差异；已有持久化字段不自动产生保留理由。
4. 按字段影响检查 defaults、edits、source switch/clear 和相关 list/detail/print/export/search；旧实验不构成兼容对象，已落库残留按正式 migration 清理。
5. UI 不补造 backend facts；客户/模板特例不污染 generic core。
6. 按影响面选择 unit、integration、contract、browser、migration validation。
   版本治理至少运行现有命名门禁及相关回归：内容变化 / 不变、跨配置启动、冻结身份的回滚 / 完成检查 / 密码轮换、错误环境和标记拒绝。沿生产者、消费者及回执链复查，区分落盘原件与同次构建的展示投影；新写入校验不能误用于历史读取。涉及冻结快照、哈希、回执或 Schema 的删除时，补齐存量转换与回放证据，不用放宽测试代替治理。

客户配置任务若进入 validate / publish / transition check / activate / readback、目标环境 migration 或 rollback，由本 skill 先确认 Product Core 与字段真源，再切 `$plush-operations-governance` 执行运行态步骤；不要另造页面私有配置真源或直接改库。

<a id="data-scale-and-concurrency"></a>

## 数据规模与并发 / Data Scale and Concurrency

先区分数据总量、单次扫描与返回范围、批次大小、读写比例、并发和热点；结合部署资源与响应目标说明当前规模和有依据的增长假设。规模未知时记录缺口，不把“亿级”等数量直接作为分库、缓存或队列的选型依据。

沿真实 repo/usecase/API 检查分页与排序、索引与过滤、汇总和导出、逐项查询与内存占用；批处理与并发写入同时守住事务、幂等、权限、冻结快照和失败恢复。前端分页或压测成功不能替代数据库查询成本及事实一致性核对。

优先调整受影响主路径；引入缓存、异步任务或分区等能力前，说明已有方案的瓶颈依据、新增一致性与运维成本，以及何时需要升级。容量假设、设计取舍和升级条件归所属模块正式设计；按 `$plush-test-governance` 选择验证，未实测的规模保持未验证；新增架构仍按当前目标与授权边界判断。

## API 合同与工作台同步 / API Contract Sync

新增、删除、改名接口，或变更请求 / 返回、权限、状态条件、幂等及错误行为时，按[公共契约维护步骤](../../../docs/engineering/跨层公共契约与生成规范.md#修改步骤--maintenance)完成同轮同步；纯实现调整且调用合同未变时核对生成零漂移。

- 从实际分发、参数解析、返回映射及所属 usecase 核对合同；维护 `server/docs/api.md` 的中文名称、用途与业务约束，以及 `server/cmd/public-contracts/testdata/rpc_examples.json` 的模拟值和来源。提取不支持实际结构时扩展生成器并验证，不手改生成物或在文档中补造后端行为。
- 运行现有生成与只读检查，使正式 API 文档、公共 RPC 标识、DEV 源码索引和“接口与集成”保持同源；删除或改名时清理旧合同、样例、调用方及失效来源关联，不留平行目录。
- 同步实际权限登记与相关回归来源，按行为影响验证；来源关联、模拟样例和生成一致不等于已执行通过。涉及工作台解析、展示或交互时验证对应消费者及浏览器行为，普通接口变更不扩成全工作台回归。

## 输出 Output

汇报 ownership decisions、source truth、changed layers、intentionally untouched layers、stale/missing paths、validation 和 residual risks。
