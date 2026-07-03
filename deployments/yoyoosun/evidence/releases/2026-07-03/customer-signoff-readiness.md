# yoyoosun Customer Signoff Readiness / 永绅客户签收就绪门禁

> 本文件是 2026-07-03 release evidence 的客户签收补充门禁。当前 release evidence 已标记 internal-only；本文件列出从 internal-only 进入客户试用 / 签收前必须补齐的证据。

## 当前状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 镜像构建 | passed | 见同目录 `release-evidence.md` |
| migration | passed | 见同目录 migration status |
| smoke | passed | 仅覆盖目标基础 smoke |
| backup restore | passed | 见 backup restore report |
| rollback rehearsal | passed | 见 rollback rehearsal report |
| authenticated effective session readback | missing | 未提供目标管理员 token，不得标记客户签收 |
| role login smoke | missing | 未按永绅角色逐个验证菜单 / 动作 / 字段 |
| print PDF target evidence | missing | 采购合同 / 加工合同目标环境 PDF 证据待补 |
| customer signoff | missing | 无客户签收人确认 |

## 必须补齐的 readback

目标环境必须执行并保存脱敏结果：

- `customer_config.get_effective_session`：确认 active revision、pages、actions、field policies、print template defaults。
- `customer_config.explain_module_status`：确认采购、委外、Workflow、打印相关模块状态。
- `customer_config.explain_process_definition`：确认 `sales_order_acceptance / material_supply / finished_goods_delivery` runtime / preview 边界。

## 必须补齐的角色 smoke

| 角色 | 必须验证 | 不允许 |
| --- | --- | --- |
| sales | 销售订单、客户、协同任务 | 看到未授权采购 / 财务写入口 |
| purchasing | 供应商、采购订单、采购合同打印 | 写库存、应付、财务事实 |
| production | 委外订单、加工合同打印 | 写质检、库存、付款事实 |
| warehouse | 库存、入库、出货执行 | 用任务完成直接增减库存 |
| quality | 质检任务和异常 | 写财务或出货事实 |
| finance | 财务放行、应收 / 应付草稿 | 冒充税控、总账、核销 |
| boss | 审批 / 退回 | 绕过业务状态和 usecase |
| engineering | 产品、SKU、BOM、工序 | 直接生成生产或库存事实 |
| pmc | 计划和风险 | 把计划当完成事实 |

## 必须补齐的打印证据

- 采购订单带值打开采购合同，字段不为空：供应商、买方、明细、金额、备注。
- 委外订单带值打开加工合同，字段不为空：加工方、委托方、明细、金额、备注。
- PDF 预览 / 下载请求必须带 `customer_key=yoyoosun`。
- 客户默认字段只覆盖买方 / 委托方，不覆盖供应商 / 加工方快照。

## 签收前结论规则

- 若 authenticated readback 缺失：只能 internal-only。
- 若任一角色 smoke 缺失：不能客户签收。
- 若采购 / 加工 PDF 任一字段缺失：不能客户签收。
- 若 raw-source 还未人工 review：不能真实导入。
- 若 release evidence 与本门禁冲突：以更保守结论为准。

## 当前结论

- [x] internal-only evidence 可保留。
- [ ] 可进入客户试用。
- [ ] 可客户签收。
- [ ] 必须回滚。
