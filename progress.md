# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件 | 范围 |
| --- | --- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |

## 最近活跃事项

- 库存台账筛选已收口为业务主筛选 + 内部引用高级筛选；后续若要显示物料 / 成品、仓库、批次的可读名称，应补后端 read model 或关联查询，不在前端伪造名称。
- 加工环节页面已收口重复页头并恢复共享列顺序能力；后续同类工程页继续复用自包含页头和共享列表工具，不再按页面类型绕开列顺序。
- 业务列表删除 / 回收站边界已写入仓库级规则和当前真源；后续若某对象确需删除，先补后端 usecase、RBAC、审计、引用检查和测试，再单独开放入口。
- `.agents/skills/plush-docs-governance` 与 `.agents/skills/plush-page-design-governance` 已作为项目内 canonical，后续修改以仓库内 skill 为准。

## 2026-06-20 库存台账筛选摘要重构

- 完成：库存台账页头摘要从表名说明改为余额、批次、流水三种只读追溯视图；统计区补充内部筛选启用状态，继续明确本页不写库存事实。
- 完成：主筛选区保留关键词、对象类型、批次状态、流水类型和来源类型；`subject_id / warehouse_id / lot_id` 改为“内部引用筛选”展开项，并提供清空入口，避免让业务用户默认手输递增内部 ID。
- 完成：库存余额 / 批次 / 流水表格中的裸引用列改为“对象内部引用 / 仓库内部引用 / 批次内部引用”，保留审计追溯能力但不冒充业务名称。
- 完成：同步 `business-formal-module-shells-desktop` L1 断言，覆盖新的库存台账摘要文案和默认搜索占位。
- 下一步：若要进一步把筛选升级为真正业务选择器，应让后端库存 read model 返回或支持查询物料 / 成品编号名称、仓库名称和批次号，再替换内部 ID 输入。
- 阻塞/风险：本轮不改后端 inventory JSON-RPC、schema、RBAC、菜单、库存流水 / 余额 / 批次事实写入，也不新增物料 / 仓库联查；当前仍只能对内部引用做精确筛选。

## 2026-06-20 业务数据生命周期页面治理

- 完成：新增 `docs/product/业务数据生命周期与页面动作规则.md`，把 `docs/reference/第二次20260611/ERP 数据生命周期与删除策略规范.md` 中可落地部分收口成当前页面动作矩阵、删除进入条件、决策路径和验收清单；明确 reference 仍是输入资料，不新增通用删除 API、RBAC、schema、migration 或 Fact 写入。
- 完成：同步 `docs/product/README.md`、`docs/文档清单.md`、`docs/当前真源与交接顺序.md` 和 `docs/reference/README.md`，补齐正式文档入口、reference 文件登记和旧英文真源路径修正。
- 完成：同步 `docs/product/prototypes/README.md`、`business-module-page-standard-v1`、`business-form-page-standard-v1`、`action-modal-drawer-standard-v1` 和 `docs/product/prototypes/index.html`，将标准业务页和局部动作弹窗从“通用回收站 / 删除确认”改为“生命周期动作说明 / 危险动作确认”。
- 完成：同步 `web/src/erp/config/devPrototypes.mjs` 和测试，避免 dev-only 原型登记重新把回收站或删除确认写成通用覆盖项。
- 完成：将运行时表单、采购 / 委外 / 出货 / 入库 / BOM 明细、打印工作台的行级“删除”文案收口为“移除行 / 移除明细 / 移除当前行”，避免误解为业务对象列表级删除；未改后端 API、RBAC、schema、migration、菜单或事实写入。
- 下一步：若后续某个对象确需删除 / 恢复，按对象专项补后端状态检查、引用检查、RBAC、审计、前端错误提示、测试和文档后再设计入口。
- 阻塞/风险：本轮不实现通用删除、恢复、软删除字段、回收站或冻结 / 合并 / 替代等 future lifecycle；原型仍保持 To Implement，未晋级 Current。

## 2026-06-20 BOM 历史版本文案收口

- 完成：将 BOM Version 页面上的 `ARCHIVED` 用户可见语义从“归档”收口为“历史版本 / 设为历史版本”，并更新激活提示，避免误解为删除、回收站或不可恢复封存。
- 完成：同步 server README、当前真源、BOM 边界评审、产品能力证据、客户交付矩阵、生命周期页面规则和菜单覆盖原型；底层 `ARCHIVED` 状态、`archive_bom_version` 方法、RBAC、schema 和 usecase 均未改变。
- 下一步：若未来需要不可恢复封存或真正软删除，应作为独立生命周期能力评审，先补后端状态 / 引用 / 审计 / 恢复边界。
- 阻塞/风险：本轮只改文案和正式口径，不改变运行时数据状态语义；此前完整 `business-formal-module-shells-desktop` L1 被 BOM 弹窗点击建议时的 AntD circular warning 卡住，已在 2026-06-20 BOM 版本建议优化中改为 `setFieldsValue` 并复跑通过。

## 2026-06-20 BOM 版本建议优化

- 完成：BOM 管理页新建 / 复制版本仍保留可填写版本号；选定产品后按同产品现有版本建议下一个 `Vn`，并提供“一键采用”，避免把工程版本误做成固定枚举下拉。
- 完成：新增 `web/src/erp/utils/bomVersionSuggestion.mjs` 与单测，按 `product_id` 真源过滤版本，不依赖当前列表分页 / 筛选结果；后端 `(product_id, version)` 唯一约束仍是最终防重复边界。
- 完成：更新 `business-formal-module-shells-desktop` L1 场景，覆盖 BOM 弹窗默认提示、选择产品后的建议、显式关闭恢复和无横向溢出。
- 下一步：后续若生产 / 委外 / 工单等业务单据接入 BOM 引用，应新增真正的 BOM Version 下拉选择并保存 BOM 内部关联，不把业务引用写成手填版本字符串。
- 阻塞/风险：本轮不新增业务单据 BOM 引用字段，不改 schema、RBAC、菜单、Workflow / Fact 或后端 usecase；复制弹窗的建议仍是前端辅助，重复版本最终由后端唯一约束兜底。

## 2026-06-20 业务主表选择列单选收口

- 完成：共享 `BusinessDataTable` 的 radio 选择列不再显示“选择”列表头；库存台账移除页面私有的“选择”列名，采购入库 L1 断言同步改为前置选择列空表头。
- 完成：销售订单、主数据、采购订单和 formal 壳页的当前操作选择从 checkbox 收口为 radio；这些页面动作区只处理当前单条记录，不再展示可多选但没有批量动作的误导状态。
- 完成：保留 BOM 管理多选能力，因为当前存在“所选设为历史版本”的真实批量语义；来源导入选择器也保留按 `multiple` 控制的 checkbox/radio 行为。
- 下一步：若后续某页新增真实批量动作，再按后端 usecase、RBAC、审计和测试评审是否恢复 checkbox 多选。
- 阻塞/风险：本轮不改 schema、RBAC、菜单、Workflow / Fact 或删除 / 回收站能力；未把“请选择”类表单校验和来源选择器文案纳入本次“选择列表头”清理范围。
