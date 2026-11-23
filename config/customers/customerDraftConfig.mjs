export const CUSTOMER_DRAFT_JSON_FILE = "customerPackage.json";
export const CUSTOMER_DRAFT_JSON_FORMAT = "json-declarative-object";

export function isCustomerDraftDesktopMenu(menu) {
  return Boolean(
    menu && typeof menu === "object" && !Array.isArray(menu) &&
    Object.keys(menu).length === 1 &&
    Array.isArray(menu.hiddenItemKeys) &&
    menu.hiddenItemKeys.every((key) => typeof key === "string" && key.trim()),
  );
}

export function customerDraftWebConfig(customerPackage) {
  const { customerKey, label, desktopMenu } = customerPackage;
  return {
    customerKey,
    label,
    brand: { companyName: label },
    desktopMenu,
  };
}

export function customerDraftWebScript(customerPackage, customerKey) {
  if (
    customerPackage?.customerKey !== customerKey ||
    customerPackage.status !== "draft" ||
    customerPackage.sourcePolicy?.trackedConfigFormat !== CUSTOMER_DRAFT_JSON_FORMAT ||
    typeof customerPackage.label !== "string" || !customerPackage.label.trim() ||
    !isCustomerDraftDesktopMenu(customerPackage.desktopMenu)
  ) {
    throw new Error("客户草稿 JSON 的身份或菜单配置无效");
  }

  return `window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze(${JSON.stringify(customerDraftWebConfig(customerPackage), null, 2)});\n`;
}
