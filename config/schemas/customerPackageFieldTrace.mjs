function target(kind, path, use) {
  return Object.freeze({ kind, path, use });
}

const runtime = (path, use) => target("manifest", path, use);
const evidence = (path, use = "随清单留存供评审；后端不执行这些声明。") => target("evidence", path, use);
const sourceOnly = (use) => target("source", "", use);
const frontend = (path, use) => target("frontend", `window.__PLUSH_ERP_CUSTOMER_CONFIG__.${path}`, use);

export const customerPackageObjectTrace = Object.freeze({
  runtimeProcessSelections: runtime("compiled_snapshot.runtimeProcessSelections", "后端发布时按流程、版本、变体和业务来源核对并生成流程定义。业务会话使用已生效的版本。"),
  processPolicies: evidence("compiled_snapshot.policyCatalog.process_policies"),
  extensionPoints: evidence("compiled_snapshot.extensionPointCatalog.extension_points", "仅供登记与评审；当前没有运行时消费者，也不加载扩展处理器。"),
});

export function customerPackageTraceForItem(key, index) {
  const trace = customerPackageObjectTrace[key];
  return { ...trace, path: `${trace.path}[${index}]` };
}

function child(parent, key) {
  return target(parent.kind, `${parent.path}.${key}`, parent.use);
}

function listItem(parent) {
  return target(parent.kind, `${parent.path}[]`, parent.use);
}

function fields(prefix, parent, mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([key, output]) => [
    `${prefix}.${key}`,
    typeof output === "string" ? child(parent, output) : output,
  ]));
}

const moduleGate = runtime("module_states[]", "已生效版本的模块查询和页面、动作门禁；模块启用不等于授予权限。");
const roleProfile = runtime("role_profiles[]", "后端读取生效版本的岗位配置与权限限制。");
const listVisibility = "有效配置会话把显隐投影到已登记的列表与 CSV；字段权限仍由后端判断。";
const printDefaults = runtime("compiled_snapshot.printTemplateDefaults.templates[]", "采购合同与加工合同打印从有效配置读取默认方；实际合同仍核对单据快照。");
const packageSnapshot = evidence("compiled_snapshot.package", "记录编译输入的身份与门禁声明；是否已生效须核对目标环境。");
const policyItem = listItem(customerPackageObjectTrace.processPolicies);

export const customerPackageFieldTrace = Object.freeze({
  ...fields("moduleStates[]", moduleGate, {
    moduleKey: "module_key",
    state: "state",
    reason: runtime("module_states[].reason", "模块状态说明和配置版本核对。"),
  }),
  "fieldPolicyOverrides[].surfaceKey": runtime("compiled_snapshot.fieldPolicies[*]", "页面范围成为对象键。" + listVisibility),
  "fieldPolicyOverrides[].fieldKey": runtime("compiled_snapshot.fieldPolicies[*][*]", "字段标识成为页面范围下的对象键。" + listVisibility),
  "fieldPolicyOverrides[].visible": runtime("compiled_snapshot.fieldPolicies[*][*].visible", listVisibility),
  "fieldPolicyOverrides[].reason": sourceOnly("客户包校验要求隐藏时说明原因；清单只保留字段显隐，不写入原因。"),
  ...fields("roleProfiles[]", roleProfile, {
    roleKey: "role_key",
    displayName: "display_name",
    ownerPools: runtime("role_profiles[].bundle_keys", "岗位配置快照记录关联范围；实际办理人按生效责任和流程实例核对。"),
    capabilityKeys: runtime("access_entitlements[].capability_key", "后端按岗位能力和权限规则限制可办理动作。"),
    menuSurfaces: runtime("compiled_snapshot.rolePageProjections[*]", "有效配置会话生成岗位页面范围，不替代后端授权。"),
    disabled: "disabled",
    revokes: "revokes",
  }),
  ...fields("runtimeProcessSelections[]", listItem(customerPackageObjectTrace.runtimeProcessSelections), {
    processKey: "process_key",
    processVersion: "process_version",
    variantKey: "variant_key",
    businessRefType: "business_ref_type",
  }),
  workPoolRoleOverrides: runtime("compiled_snapshot.workPoolRoleOverrides", "编译时用于生成清单责任池成员；实际办理仍按生效配置、权限与实例核对。"),
  ...fields("brand", frontend("brand", "前端品牌读取器用于登录页、系统标题和桌面或手机入口图标。"), {
    brandMark: "brandMark",
    companyName: "companyName",
    systemName: "systemName",
    faviconHref: "faviconHref",
    mobileFaviconHref: "mobileFaviconHref",
  }),
  ...fields("desktopMenu", frontend("desktopMenu", "前端桌面菜单组织、文案和页内入口；不改变后端权限。"), {
    presentation: "presentation",
    sections: "sections",
    hiddenItemKeys: "hiddenItemKeys",
    routeOnlyItemKeys: "routeOnlyItemKeys",
    itemOverrides: "itemOverrides",
  }),
  workflows: evidence("compiled_snapshot.preview.workflows", "保留工作流评审摘要；不生成正式流程定义。"),
  businessFlows: evidence("compiled_snapshot.flowCatalog.business_flows"),
  stateMachines: evidence("compiled_snapshot.flowCatalog.state_machines"),
  processPolicies: customerPackageObjectTrace.processPolicies,
  extensionPoints: customerPackageObjectTrace.extensionPoints,
  ...fields("processPolicies[]", policyItem, {
    key: "key",
    kind: "kind",
    label: "label",
    status: "status",
    rules: "rules",
    guardrail: "guardrail",
  }),
  ...fields("processPolicies[].rules[]", listItem(child(policyItem, "rules")), {
    key: "key",
    when: "when",
    decision: "decision",
    action: "action",
    note: "note",
  }),
  ...fields("extensionPoints[]", listItem(customerPackageObjectTrace.extensionPoints), {
    key: "key",
    label: "label",
    status: "status",
    runtimeEnabled: "runtime_enabled",
    guardrail: "guardrail",
  }),
  ...fields("printTemplateDefaults[]", printDefaults, {
    templateKey: "template_key",
    status: evidence("compiled_snapshot.preview.printTemplateDefaults[].status", "仅记录原始声明状态；正式打印投影状态由编译生成。"),
    partyDefaults: "party_defaults",
    guardrail: evidence("compiled_snapshot.printTemplateDefaults.templates[].guardrail", "记录打印默认方的使用边界，不是实际打印内容。"),
  }),
  ...fields("printTemplateDefaults[].partyDefaults", child(printDefaults, "party_defaults"), {
    buyerCompany: "buyerCompany",
    buyerContact: "buyerContact",
    buyerPhone: "buyerPhone",
    buyerAddress: "buyerAddress",
    buyerSigner: "buyerSigner",
  }),
  customerKey: runtime("customer_key", "发布执行器与后端按客户核对发布、激活和回读范围。"),
  packageKey: child(packageSnapshot, "key"),
  label: evidence("compiled_snapshot.customer.name", "用于识别清单内的客户包。"),
  status: child(packageSnapshot, "status"),
  runtimeEnabled: child(packageSnapshot, "runtimeEnabled"),
  sourcePolicy: evidence("compiled_snapshot.package", "编译记录预览和发布资格。其它来源限制和操作开关在各自入口校验，不因清单记录而开放。"),
  boundaries: evidence("compiled_snapshot.preview.guardrails.boundaries", "保留配置校验与审查的边界；不改变运行权限和业务事实。"),
  revision: Object.freeze({ ...runtime("revision", "发布、激活、回滚和目标读回使用同一个版本标识。"), generated: true }),
});
