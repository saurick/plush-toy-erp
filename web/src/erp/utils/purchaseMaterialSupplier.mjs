import { materialOption } from './referenceSelectOptions.mjs'

export function purchaseMaterialMatchesSupplier(material, supplierID) {
  return (
    !material?.supplier_id ||
    Number(material.supplier_id) === Number(supplierID)
  )
}

export function purchaseMaterialOption(material, supplierID) {
  const matches = purchaseMaterialMatchesSupplier(material, supplierID)
  const option = materialOption(material)
  return {
    ...option,
    value: material.id,
    label: [
      option?.label,
      matches ? '' : '其他厂商，需重选',
    ]
      .filter(Boolean)
      .join(' · '),
    item: material,
    disabled: !matches,
  }
}
