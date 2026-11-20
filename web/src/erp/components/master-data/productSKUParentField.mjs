const CREATE_PRODUCT_SKU_PARENT_FIELD = Object.freeze({
  allowClear: true,
  disabled: false,
  helpText: undefined,
})

const EDIT_PRODUCT_SKU_PARENT_FIELD = Object.freeze({
  allowClear: false /* 不可清空：编辑 SKU 的父产品被冻结，关联身份不可在此改动。 */,
  disabled: true,
  helpText: '创建后不可更换所属产品',
})

export function productSKUParentFieldContract(isEditing = false) {
  return isEditing
    ? EDIT_PRODUCT_SKU_PARENT_FIELD
    : CREATE_PRODUCT_SKU_PARENT_FIELD
}
