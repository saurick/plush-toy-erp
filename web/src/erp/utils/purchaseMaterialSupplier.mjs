export function purchaseMaterialMatchesSupplier(material, supplierID) {
  return (
    !material?.supplier_id ||
    Number(material.supplier_id) === Number(supplierID)
  )
}

export function purchaseMaterialOption(material, supplierID) {
  const matches = purchaseMaterialMatchesSupplier(material, supplierID)
  return {
    value: material.id,
    label: [
      material.code,
      material.name,
      material.supplier_item_no,
      matches ? '' : '其他厂商，需重选',
    ]
      .filter(Boolean)
      .join(' · '),
    item: material,
    disabled: !matches,
  }
}
