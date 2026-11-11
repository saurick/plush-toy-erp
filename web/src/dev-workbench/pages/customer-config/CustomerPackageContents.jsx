import { WorkbenchFacts } from '../../components/WorkbenchPattern.jsx'

function candidateValues(items, getValue, unit) {
  const changed = items.filter((item) => item.overridden)
  if (changed.length) return changed.map(getValue).join('；')
  if (!items.length) return '暂无登记项'
  const defaults = new Set(items.map((item) => item.defaultStateLabel || item.defaultLabel))
  const value = defaults.size === 1 ? `（${[...defaults][0]}）` : ''
  return `${items.length} ${unit}沿用产品默认${value}`
}

const detailTitles = Object.freeze({
  config: '本包后端配置',
  display: '本包品牌与菜单',
})

export function CustomerPackageContents({ area, summary, menu }) {
  const facts = area === 'config'
    ? [
      { label: '模块状态', value: candidateValues(summary.moduleStates, (item) => `${item.label}：${item.stateLabel}`, '个模块') },
      { label: '列表与导出字段', value: candidateValues(summary.fieldVisibilityReview, (item) => `${item.label}：${item.candidateLabel}`, '列') },
      { label: '岗位配置', value: summary.roleProfileNames.join('、') || '未声明岗位覆盖' },
      {
        label: '打印默认抬头',
        value: summary.printTemplateDefaults.map((item) => `${item.templateLabel}：${item.buyerCompany || '未填写'}`).join('；') || '未声明',
      },
      { label: '正式流程选择', value: `${summary.runtimeProcessSelections.length} 项发布候选` },
    ] : [
      { label: '公司名称', value: menu.brand.companyName || '未声明' },
      { label: '系统名称', value: menu.brand.systemName || '未声明' },
    ]

  return (
    <section className="erp-dev-customer-package-detail" aria-label={detailTitles[area]}>
      <WorkbenchFacts items={facts} />
    </section>
  )
}
