export const UNCLASSIFIED_PERMISSION_MODULE_TITLE = '未分类功能'

export function getPermissionModuleTitle(moduleName = '') {
  const normalizedName = String(moduleName || '').trim()
  return /[\u3400-\u9fff]/u.test(normalizedName)
    ? normalizedName
    : UNCLASSIFIED_PERMISSION_MODULE_TITLE
}
