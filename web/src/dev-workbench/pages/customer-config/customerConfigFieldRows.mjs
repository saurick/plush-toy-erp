import { customerPackageFieldGuide } from '../../../../../config/schemas/customerPackageFieldGuide.mjs'
import { getActiveERPBrand } from '../../../common/consts/brand.js'

export const CONFIG_FILE_LOCATION_LABEL = '配置文件位置'
export const DEFAULT_VALUE_COLUMN = '系统默认值'
export const PREVIEW_VALUE_COLUMN = '客户包预览值'

const definitions = new Map(customerPackageFieldGuide.flatMap(({ fields }) => fields.map((field) => [field.path, field])))
const brandDefaults = getActiveERPBrand({})
const menuDefaults = { presentation: 'sectioned', hiddenItemKeys: [], routeOnlyItemKeys: [] }

function fieldRow(key, path, properties) {
  const { label, description } = definitions.get(path)
  return { key, path, label, description, ...properties }
}

function displayRows(menuSummary) {
  const { label, brand = {}, desktopMenu = {} } = menuSummary.displayDeclarations
  return [
    ...(typeof label === 'string'
      ? [fieldRow('display-label', 'label', {
          label: '品牌公司名称',
          defaultValue: brandDefaults.companyName,
          value: label,
          overridden: true,
          description: '预览使用客户包名称作为公司名称。',
        })]
      : []),
    ...Object.keys(brandDefaults).filter((key) => key !== 'customerKey' && !(key === 'companyName' && typeof label === 'string')).map((key) =>
      fieldRow(`brand-${key}`, `brand.${key}`, {
        defaultValue: brandDefaults[key],
        value: Object.hasOwn(brand, key) ? brand[key] : brandDefaults[key],
        overridden: Object.hasOwn(brand, key),
      })
    ),
    ...Object.keys(menuDefaults).map((key) => fieldRow(`menu-${key}`, `desktopMenu.${key}`, {
      defaultValue: menuDefaults[key],
      value: Object.hasOwn(desktopMenu, key) ? desktopMenu[key] : menuDefaults[key],
      overridden: Object.hasOwn(desktopMenu, key),
    })),
  ]
}

export function buildCustomerConfigFieldRows({ customerPackageSummary, menuSummary }) {
  const modules = customerPackageSummary.moduleStates.map((item) => fieldRow(`module-${item.moduleKey}`, 'moduleStates[].state', {
    label: item.label,
    conditions: [['moduleKey', item.moduleKey]],
    defaultValue: item.defaultState,
    defaultLabel: item.defaultStateLabel,
    value: item.state,
    valueLabel: item.stateLabel,
    overridden: item.overridden,
    description: '决定这个模块能否办理业务。只读时可以查询，新增和修改受限。',
    reason: item.overridden ? item.reason : undefined,
  }))
  const fields = customerPackageSummary.fieldVisibilityReview.map((item) => fieldRow(`visibility-${item.key}`, 'fieldPolicyOverrides[].visible', {
    label: item.label,
    conditions: [['surfaceKey', item.surfaceKey], ['fieldKey', item.fieldKey]],
    defaultValue: item.defaultVisible,
    defaultLabel: item.defaultLabel,
    value: item.candidateVisible,
    valueLabel: item.candidateLabel,
    overridden: item.overridden,
    description: `控制该列在列表和导出 CSV 中的显示。${item.impact.includes('受保护') ? '这是必须显示的列。' : ''}`,
    reason: item.reason,
  }))
  const printing = customerPackageSummary.printTemplateDefaults.map((item) =>
    fieldRow(`print-${item.templateKey}`, 'printTemplateDefaults[].partyDefaults.buyerCompany', {
      label: `${item.templateLabel} · 买方 / 委托方名称`,
      conditions: [['templateKey', item.templateKey]],
      defaultLabel: '未设客户默认方',
      value: item.partyDefaultKeys.includes('buyerCompany') ? item.buyerCompany : undefined,
      overridden: item.partyDefaultKeys.includes('buyerCompany'),
    })
  )
  const rows = [...modules, ...fields, ...displayRows(menuSummary), ...printing]
  return [...rows.filter((row) => row.overridden), ...rows.filter((row) => !row.overridden)]
}
