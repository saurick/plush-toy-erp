import { unitRecordMatchesLabel } from './unitQuantity.mjs'

function text(value) {
  return String(value ?? '').trim()
}

function comparable(value) {
  return text(value)
    .replace(/[“”″]/gu, '"')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
}

export function readBOMMaterialSource(item = {}) {
  const snapshot = item.source_snapshot
  const imported = item._import_source
  if (!snapshot && !imported) return null
  return {
    materialCode: text(snapshot?.material_code ?? imported?.materialCode),
    materialName: text(snapshot?.material_name ?? imported?.materialName),
    supplierItemNo: text(
      snapshot?.supplier_item_no ?? imported?.supplierItemNo
    ),
    materialSpec: text(snapshot?.material_spec ?? imported?.materialSpec),
    color: text(snapshot?.color ?? imported?.color),
    unit: text(snapshot?.unit ?? imported?.unit),
    rowNumber: snapshot?.row_number ?? imported?.rowNumber,
    fileName: text(snapshot?.file_name),
    sheetName: text(snapshot?.sheet_name),
  }
}

export function findBOMSourceUnit(source, units = []) {
  if (!source?.unit) return undefined
  const matches = units.filter((unit) =>
    unitRecordMatchesLabel(
      {
        ...unit,
        name: unit.name ?? unit.label,
      },
      source.unit
    )
  )
  return matches.length === 1
    ? Number(matches[0].id ?? matches[0].value)
    : undefined
}

export function compareBOMMaterial(item, material = {}, units = []) {
  const source = readBOMMaterialSource(item)
  if (!source || !material) return []
  const materialUnit = units.find(
    (unit) => Number(unit.id ?? unit.value) === Number(material.default_unit_id)
  )
  const sourceUnitID = findBOMSourceUnit(source, units)
  return [
    ['materialCode', '材料编号', material.code, true],
    ['materialName', '物料名称', material.name, false],
    ['supplierItemNo', '厂商料号', material.supplier_item_no, false],
    ['materialSpec', '规格', material.spec, true],
    ['color', '颜色 / 色号', material.color, true],
    ['unit', '单位', materialUnit?.name ?? materialUnit?.label, true],
  ]
    .map(([key, label, value, requiredMatch]) => {
      const original = source[key]
      const current = text(value)
      const differs = Boolean(
        original && current && comparable(original) !== comparable(current)
      )
      const unitConflict =
        key === 'unit' && sourceUnitID && material.default_unit_id
          ? sourceUnitID !== Number(material.default_unit_id)
          : false
      return {
        key,
        label,
        original,
        current,
        differs:
          key === 'unit' && sourceUnitID && material.default_unit_id
            ? Boolean(unitConflict)
            : differs,
        blocking:
          requiredMatch && (key === 'unit' ? Boolean(unitConflict) : differs),
      }
    })
    .filter((row) => row.original || row.current)
}

export function bomMaterialConflictText(item, material, units = []) {
  if (!material) return ''
  if (material.is_active === false) return '物料已停用'
  const fields = compareBOMMaterial(item, material, units)
    .filter((row) => row.blocking)
    .map((row) => row.label)
  return fields.length ? `${fields.join('、')}与原表不同` : ''
}

export function buildBOMMaterialCreateDefaults(item, units = []) {
  const source = readBOMMaterialSource(item)
  if (!source) return {}
  return {
    ...(source.materialCode ? { code: source.materialCode } : {}),
    name: source.materialName || undefined,
    // 供料方式保留在原表快照中，不带成厂商的物料编号。
    supplier_item_no:
      source.supplierItemNo === '客供'
        ? undefined
        : source.supplierItemNo || undefined,
    spec: source.materialSpec || undefined,
    color: source.color || undefined,
    default_unit_id: findBOMSourceUnit(source, units),
  }
}
