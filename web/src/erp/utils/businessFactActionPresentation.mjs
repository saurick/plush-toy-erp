// 只维护业务动作的展示文案；权限、状态转换和写入仍由所属业务入口决定。
function action(label, description, success, title = `${label}？`) {
  return Object.freeze({ label, title, description, success })
}

function stockActions(name, post, cancel, draftName = `${name}草稿`) {
  return Object.freeze({
    name,
    post,
    cancel,
    void: action(`作废${draftName}`, '草稿尚未生效，作废不会改变库存；原记录继续保留。', `${draftName}已作废，库存未发生变动`),
  })
}

const production = Object.freeze({
  MATERIAL_ISSUE: stockActions('生产领料',
    action('确认领料出库', '确认本次领用数量、仓库和批次，扣减相应材料库存。', '领料已出库'),
    action('撤销领料出库', '撤销本次领料的库存影响，保留原领料记录、办理时间和撤销原因。', '领料出库已撤销，本次库存影响已恢复')),
  FINISHED_GOODS_RECEIPT: stockActions('成品入库',
    action('确认成品入库', '确认实收数量、仓库和批次并增加成品库存；检验与查货包装继续按对应业务办理。', '成品已确认入库；待检、待包装数量仍不能发货', '确认实收并增加成品库存？'),
    action('撤销成品入库', '撤销本次成品入库的库存影响，保留原入库记录、办理时间和撤销原因。', '成品入库已撤销，本次库存影响已恢复'),
    '完工报告'),
  REWORK: stockActions('返工',
    action('确认返工', '按本次返工数量处理原成品库存，并生成返工补制批次和生产异常任务。', '返工已确认，返工补制批次和生产异常任务已生成'),
    action('撤销返工', '按返工依赖规则撤销本次返工及库存影响，保留原记录和撤销原因。', '返工已撤销，本次库存影响已恢复')),
})

const outsourcing = Object.freeze({
  MATERIAL_ISSUE: stockActions('委外发料',
    action('确认委外发料', '核对加工厂、材料、数量、仓库和批次，确认后扣减本次发料库存。', '委外发料已出库'),
    action('撤销委外发料', '撤销本次委外发料的库存影响，保留原记录、办理时间和撤销原因。', '委外发料已撤销，本次库存影响已恢复')),
  RETURN_RECEIPT: stockActions('委外回货',
    action('确认回货入库', '核对本次回货数量、仓库和批次，确认后增加相应库存；质检与应付继续按各自条件办理。', '本次委外回货已入库'),
    action('撤销回货入库', '撤销本次委外回货入库的库存影响，保留原回货记录、办理时间和撤销原因。', '回货入库已撤销，本次库存影响已恢复')),
})

function financeActions(name, postLabel, postDescription, postedMessage) {
  return Object.freeze({
    name,
    post: action(postLabel, postDescription, postedMessage),
    cancel: action(`取消${name}`, '按来源及下游依赖规则取消本记录，保留原金额、办理时间和取消原因；不代表实际退款或库存变动。', `${name}已取消，原记录与取消原因已保留`),
    void: action(`作废${name}草稿`, '草稿尚未生效，作废不会产生正式财务结果或库存变动；原记录与作废原因继续保留。', `${name}草稿已作废`),
  })
}

const finance = Object.freeze({
  RECEIVABLE: financeActions('应收账款', '确认应收账款', '核对来源、往来方、金额、币种和账期，确认后形成正式应收账款；实际收款另行登记。', '应收账款已确认'),
  PAYABLE: financeActions('应付账款', '确认应付账款', '核对来源、往来方、金额、币种和账期，确认后形成正式应付账款；实际付款另行登记。', '应付账款已确认'),
  INVOICE: financeActions('发票记录', '确认发票记录', '核对来源与金额，确认系统中的发票记录；不代表已完成税控开票。', '发票记录已确认'),
  RECONCILIATION: financeActions('对账记录', '确认对账记录', '确认本次对账来源和金额，之后仍需完成实际核对；不代表已经收付款。', '对账记录已确认'),
})

const inventory = Object.freeze({
  CYCLE_COUNT: stockActions('库存盘点',
    action('确认盘点并更新库存', '按已复核的实盘数量确认盘点结果；有差异时更新库存，零差异也保留盘点记录。', '盘点结果已确认；库存差异已处理'),
    action('撤销库存盘点', '按库存依赖规则撤销本次盘点差异，保留盘点、复核及反向记录。', '库存盘点已撤销，本次库存影响已恢复')),
  TRANSFER: stockActions('库存调拨',
    action('确认调拨', '核对调出仓库、调入仓库、批次和数量；确认后同时记录调出与调入。', '库存调拨已完成'),
    action('撤销库存调拨', '撤销本次调出与调入的库存影响，保留原调拨和反向记录。', '库存调拨已撤销，本次库存影响已恢复')),
  MANUAL_ADJUSTMENT: stockActions('库存调整',
    action('确认库存调整', '按已批准的调整内容更新库存，保留本次调整依据与记录。', '库存调整已生效'),
    action('撤销库存调整', '按库存依赖规则撤销本次调整，保留原调整和反向记录。', '库存调整已撤销，本次库存影响已恢复')),
})

const purchase = Object.freeze({
  receipt: stockActions('材料入库',
    action('确认材料入库', '仅将当前合格且尚未入库的明细入库；其余明细继续检验或处置，已入库行不重复确认。', '本次合格材料已入库', '确认将当前合格且尚未入库的明细入库？'),
    action('撤销材料入库', '按采购入库依赖规则撤销本次入库的库存影响，保留原记录和反向记录。', '材料入库已撤销，本次库存影响已恢复')),
  return: stockActions('采购退货',
    action('确认采购退货', '核对本次退货明细，确认后扣减相应库存。', '采购退货已确认'),
    action('撤销采购退货', '撤销本次采购退货的库存影响，保留原退货和反向记录。', '采购退货已撤销，本次库存影响已恢复')),
  adjustment: stockActions('入库调整',
    action('确认入库调整', '核对本次入库调整内容，确认后按调整明细更新库存。', '入库调整已确认'),
    action('撤销入库调整', '撤销本次入库调整的库存影响，保留原调整和反向记录。', '入库调整已撤销，本次库存影响已恢复')),
})

const unselected = Object.freeze({
  production: stockActions('生产记录', action('确认生产记录', '请先选择并核对本次生产记录。', '生产记录已确认'), action('撤销生产记录', '请先选择需要撤销的生产记录。', '生产记录已撤销')),
  outsourcing: stockActions('委外记录', action('确认委外记录', '请先选择并核对本次委外记录。', '委外记录已确认'), action('撤销委外记录', '请先选择需要撤销的委外记录。', '委外记录已撤销')),
  finance: financeActions('财务记录', '确认财务记录', '请先选择并核对本次财务记录。', '财务记录已确认'),
  inventory: stockActions('库存作业', action('确认库存作业', '请先选择并核对本次库存作业。', '库存作业已确认'), action('撤销库存作业', '请先选择需要撤销的库存作业。', '库存作业已撤销')),
})

function presentation(profile, record, actionKey) {
  if (actionKey === 'cancel' && record?.status === 'DRAFT') return profile.void
  const value = profile[actionKey]
  if (!value) throw new Error(`未登记的业务展示动作：${actionKey}`)
  return value
}

export function operationalFactActionPresentation(scope, record, actionKey = 'post') {
  const profiles = { production, outsourcing, finance }[scope]
  if (!profiles) throw new Error(`未登记的业务记录展示范围：${scope}`)
  const profile = record?.fact_type ? profiles[record.fact_type] : unselected[scope]
  if (!profile) throw new Error(`未登记的业务记录展示类型：${scope}/${record.fact_type}`)
  return presentation(profile, record, actionKey)
}

export function inventoryOperationActionPresentation(record, actionKey = 'post') {
  const profile = record?.operation_type ? inventory[record.operation_type] : unselected.inventory
  if (!profile) throw new Error(`未登记的库存作业展示类型：${record.operation_type}`)
  if (actionKey === 'submit') {
    return action(
      record.operation_type === 'CYCLE_COUNT' ? '提交盘点复核' : '提交调整审批',
      '提交后由其他有权人员复核；审批通过后仍需确认执行，库存才会变化。',
      `${profile.name}已提交复核，库存尚未变化`
    )
  }
  if (actionKey === 'cancel' && record?.status && !['DRAFT', 'POSTED'].includes(record.status)) {
    return action(`取消${profile.name}`, '本次作业尚未更新库存；取消后保留申请、审批和取消原因。', `${profile.name}已取消，库存未发生变动`)
  }
  return presentation(profile, record, actionKey)
}

export function purchaseFactActionPresentation(kind, record, actionKey = 'post') {
  const profile = purchase[kind]
  if (!profile) throw new Error(`未登记的采购记录展示类型：${kind}`)
  const value = presentation(profile, record, actionKey)
  return kind === 'receipt' && actionKey === 'post' && Number(record?.pending_inbound_lines) > 0
    ? { ...value, success: '合格材料已入库，其余明细继续检验或处置' }
    : value
}

export function financePaymentActionPresentation(record, actionKey = 'post', { cashOnly = false } = {}) {
  const name = record?.direction === 'RECEIPT' ? '收款' : record?.direction === 'DISBURSEMENT' ? '付款' : '收付款'
  if (actionKey === 'reverse') return action(`冲销${name}入账`, '冲销本次入账及核销影响，保留原款项与反向记录；实际退款另行登记并审批。', `${name}入账已冲销，原核销影响已撤销`)
  if (actionKey === 'cancel') return action(`取消${name}登记`, '本记录尚未入账；取消后保留原登记与审批记录，不代表实际退款。', `${name}登记已取消`)
  if (actionKey !== 'post') throw new Error(`未登记的收付款展示动作：${actionKey}`)
  return cashOnly
    ? action(`确认${name}入账`, '核对实际收付金额、币种和凭据，确认后记录本次资金业务；不会发起银行转账。', `${name}已入账，款项余额已更新`)
    : action('确认入账并核销', '核对实际收付与核销明细，确认后记录款项并抵扣对应应收或应付；不会发起银行转账。', `${name}已入账并完成核销`)
}
