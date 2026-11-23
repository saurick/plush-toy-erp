import { resolveDevCustomerConfigPackage } from '../../config/devCustomerConfig.mjs'

export function buildCustomerConfigDeclarationExport(customerKey) {
  const { packageConfig } = resolveDevCustomerConfigPackage(customerKey)
  if (!packageConfig) throw new Error('客户配置包未登记')
  const {
    customerPackage, customerPackageSourcePath,
    menuConfig, menuConfigSourcePath,
    fieldNumberingConfig, fieldNumberingSourcePath,
  } = packageConfig
  const declarations = {
    [customerPackageSourcePath]: customerPackage,
    ...(menuConfig && { [menuConfigSourcePath]: menuConfig }),
    ...(fieldNumberingConfig && { [fieldNumberingSourcePath]: fieldNumberingConfig }),
  }
  return {
    filename: `${packageConfig.customerKey}-配置声明.json`,
    json: `${JSON.stringify(declarations, null, 2)}\n`,
  }
}
