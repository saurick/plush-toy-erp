export async function loadBOMPrintSnapshot(
  id,
  { getBOMVersion, getProduct, listAllMaterials, listAllUnits }
) {
  const detail = await getBOMVersion({ id })
  if (!detail?.product_id || !Array.isArray(detail.items)) {
    throw new Error('物料清单资料不完整，请刷新后重试')
  }
  // Historical BOMs may reference disabled masters; print reads must not use
  // the editor's active-only options or a previously selected version.
  const [product, materialData, unitData] = await Promise.all([
    getProduct({ id: detail.product_id }),
    listAllMaterials({ active_only: false }),
    listAllUnits(),
  ])
  const materials = materialData?.materials || []
  const units = unitData?.units || []
  const materialIDs = new Set(materials.map((item) => Number(item.id)))
  const unitIDs = new Set(units.map((item) => Number(item.id)))
  if (
    Number(product?.id) !== Number(detail.product_id) ||
    detail.items.some(
      (item) =>
        !materialIDs.has(Number(item.material_id)) ||
        !unitIDs.has(Number(item.unit_id))
    )
  ) {
    throw new Error('物料清单关联的产品、材料或单位资料不完整')
  }
  return { detail, products: [product], materials, units }
}
