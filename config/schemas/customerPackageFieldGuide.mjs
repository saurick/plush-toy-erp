import { customerPackageSchema as schema } from "./customerPackageSchema.mjs";
import { customerPackageFieldTrace } from "./customerPackageFieldTrace.mjs";

function fields(prefix, definitions, { keys = Object.keys(definitions), required = [] } = {}) {
  return keys.map((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!definitions[key]) throw new Error(`Missing customer package field guide for ${path}`);
    const trace = customerPackageFieldTrace[path];
    if (!trace) throw new Error(`Missing customer package field trace for ${path}`);
    const [label, type, description] = definitions[key];
    return {
      path,
      label,
      type,
      required: required.includes(key),
      description,
      trace,
    };
  });
}

export const customerPackageFieldGuide = Object.freeze([
  {
    key: "modules",
    label: "模块运行设置",
    description: "模块状态须满足后端的模块依赖和权限检查。",
    fields: fields("moduleStates[]", {
      moduleKey: ["模块", "文本", "使用产品目录已登记的模块标识；每个模块最多声明一次。"],
      state: ["运行状态", "枚举", `可选 ${Object.entries(schema.moduleStates).map(([key, label]) => `${label}（${key}）`).join("、")}。不声明覆盖时使用${schema.moduleStates[schema.defaultModuleState]}。只读限制写入；关闭不删除历史数据。`],
      reason: ["原因", "文本", "只读或关闭时必填，说明限制模块的业务原因。"],
    }, { required: ["moduleKey", "state"] }),
    example: { moduleStates: [{ moduleKey: "production_orders", state: "read_only", reason: "试用期间只查生产订单" }] },
  },
  {
    key: "field-visibility",
    label: "列表与导出字段",
    description: "仅支持登记的列表和 CSV 列显隐。表单必填、可编辑性和后端校验由产品规则决定。",
    fields: fields("fieldPolicyOverrides[]", {
      surfaceKey: ["页面范围", "文本", "选择已登记的客户、供应商或销售订单列表范围。"],
      fieldKey: ["字段", "文本", "使用所选页面范围允许的字段标识；同一范围的字段只能覆盖一次。"],
      visible: ["是否显示", "布尔值", `可填 true（显示）或 false（隐藏），受保护字段不得隐藏。无覆盖时为 ${schema.defaultFieldVisible}。`],
      reason: ["原因", "文本", "隐藏字段时必填；如果显示，原因可以省略。"],
    }, { keys: schema.allowedFieldPolicyOverrideKeys, required: schema.requiredFieldPolicyOverrideKeys }),
    example: { fieldPolicyOverrides: [{ surfaceKey: "sales_orders.default", fieldKey: "source_no", visible: false, reason: "该列表不展示客户订单号" }] },
  },
  {
    key: "roles",
    label: "岗位与页面",
    description: "岗位投影只收窄已分配的后端权限。实际可办理结果到权限关系核对。",
    fields: fields("roleProfiles[]", {
      roleKey: ["岗位标识", "文本", "引用产品已登记的岗位，不在客户包中创建角色。"],
      displayName: ["岗位名称", "文本", "用于辨认这个客户的岗位称谓。"],
      ownerPools: ["流程责任池", "列表", "引用该岗位可以承接的登记责任池。实际办理仍检查负责人和流程状态。"],
      capabilityKeys: ["能力范围", "列表", "填写登记能力，包含任务读取。不能增加后端角色原本没有的权限。"],
      menuSurfaces: ["页面范围", "列表", "至少选择一个登记页面；页面所需的读取能力必须包含在能力范围内。"],
      disabled: ["停用岗位投影", "布尔值", "默认不关闭岗位投影；停用不删除岗位或员工账号。"],
      revokes: ["收回能力", "列表", "填写需要从该岗位收回的能力；未填不额外收回。"],
    }, { required: ["roleKey", "displayName", "ownerPools", "capabilityKeys", "menuSurfaces"] }),
  },
  {
    key: "processes",
    label: "正式流程选择",
    description: "发布清单只采用已登记的流程组合。工作区流程草图和策略声明仅供预览。",
    fields: [...fields("runtimeProcessSelections[]", {
      processKey: ["流程", "文本", "引用已登记的流程；同一流程只能选择一次。"],
      processVersion: ["流程合同版本", "文本", "必须和登记的流程、变体匹配。"],
      variantKey: ["流程变体", "文本", "在该流程版本的已登记变体中选择，不能自由增加或重排节点。"],
      businessRefType: ["业务来源", "文本", "必须与流程登记的来源单据类型一致。"],
    }, { keys: schema.allowedRuntimeProcessSelectionKeys, required: schema.allowedRuntimeProcessSelectionKeys }), ...fields("", {
      workPoolRoleOverrides: ["责任池岗位覆盖", "对象", "将登记的责任池映射到登记岗位；未覆盖时沿用产品的责任池映射。"],
    })],
  },
  {
    key: "presentation",
    label: "品牌与菜单",
    source: "frontend",
    description: "这部分来自前端部署配置；菜单显示不能代替后端权限。",
    fields: [
      ...fields("brand", {
        brandMark: ["品牌简称", "文本", "界面使用的简短品牌标记。"],
        companyName: ["公司名称", "文本", "界面展示的公司名称。"],
        systemName: ["系统名称", "文本", "界面展示的系统名称。"],
        faviconHref: ["桌面图标", "资源路径", "使用已审查的公开品牌图标。"],
        mobileFaviconHref: ["手机图标", "资源路径", "未填时沿用桌面图标。"],
      }),
      ...fields("desktopMenu", {
        presentation: ["桌面菜单模式", "枚举", "可选分组菜单（sectioned）或岗位导览（role_guided）；默认分组菜单。"],
        sections: ["分组与排序", "列表", "每组用 title 命名，items 按登记菜单标识排序。"],
        hiddenItemKeys: ["隐藏的菜单", "列表", "按菜单标识隐藏前端入口，不撤销后端能力。"],
        routeOnlyItemKeys: ["页内路由", "列表", "保留符合条件的页内路由入口，不生成独立侧栏菜单。"],
        itemOverrides: ["菜单文案覆盖", "对象", "按登记菜单标识覆盖名称、短名称或说明（label、shortLabel、description）。"],
      }),
    ],
  },
  {
    key: "policies",
    label: "策略草案字段",
    description: "声明评审用的条件与结果。即使随正式清单留存，也不会由后端执行。",
    fields: [
      ...fields("processPolicies[]", {
        key: ["策略标识", "文本", "引用已登记的策略标识。"],
        kind: ["策略类型", "枚举", `允许 ${schema.allowedPolicyKinds.join("、")}。`],
        label: ["策略名称", "文本", "供评审时辨认该草案。"],
        status: ["声明状态", "固定值", "只能是 preview_only（仅供预览）。"],
        rules: ["条件与结果", "列表", "至少声明一条规则；每条都要有条件和结果。"],
        guardrail: ["策略边界", "文本", "说明适用范围和不能绕过的校验或业务限制。"],
      }, { required: ["key", "kind", "status", "rules", "guardrail"] }),
      ...fields("processPolicies[].rules[]", {
        key: ["条件标识", "文本", "与 when 至少填写一个，用于识别草案中的条件。"],
        when: ["条件说明", "文本", "与 key 至少填写一个；它是文字声明，不是可执行表达式。"],
        decision: ["判断结果", "文本", "与 action 至少填写一个，记录条件满足时的评审结果。"],
        action: ["拟议动作", "文本", "与 decision 至少填写一个；记录预览动作，不执行后端命令。"],
        note: ["规则备注", "文本", "选填。补充边界或待核对的前提。"],
      }, { keys: schema.allowedProcessPolicyRuleKeys }),
    ],
  },
  {
    key: "extensions",
    label: "扩展候选字段",
    description: "仅登记候选。正式实现需要另行评审输入输出、权限、异常处理和停用后的行为。",
    fields: fields("extensionPoints[]", {
      key: ["扩展标识", "文本", "用于在登记与评审中识别候选。"],
      label: ["扩展名称", "文本", "写明准备解决的业务差异。"],
      status: ["声明状态", "固定值", "只能是 preview_only（仅供评审）。"],
      runtimeEnabled: ["运行时开关", "固定值", "必须为 false。客户包不能加载处理器或模块。"],
      guardrail: ["用途与边界", "文本", "说明预计接入位置和影响范围；这里不登记执行代码。"],
    }, { required: ["key", "label", "status", "runtimeEnabled", "guardrail"] }),
  },
  {
    key: "preview",
    label: "流程与扩展预览",
    description: "这些声明用于评审。已登记的正式流程、事实规则和目标生效配置仍各有自己的来源。",
    fields: fields("", {
      workflows: ["工作流草案", "列表", "记录任务节点、办理责任和命令引用，只供核对协同。"],
      businessFlows: ["业务流转草案", "列表", "记录拟关联的业务范围，只供评审。"],
      stateMachines: ["状态机草案", "列表", "记录状态和候选转换，不改变后端状态规则。"],
      processPolicies: ["流程策略声明", "列表", "登记可评审的跳过、自动生成或关闭策略。声明不执行规则。"],
      extensionPoints: ["扩展候选", "列表", "没有候选时保留空列表。有候选时只说明用途、影响和边界，不能提供运行时处理器。"],
    }, { required: schema.requiredTopLevelKeys }),
  },
  {
    key: "print",
    label: "打印默认方信息",
    description: "只影响采购合同的买方或加工合同的委托方。供应商、加工方和明细仍来自业务单据。",
    fields: [
      ...fields("printTemplateDefaults[]", {
        templateKey: ["合同模板", "枚举", `每个模板最多声明一次。可用标识：${schema.allowedPrintTemplateKeys.join("、")}。`],
        status: ["声明状态", "固定值", "工作区条目为 preview_only；正式使用须经发布和目标读回。"],
        partyDefaults: ["默认方字段", "对象", "填写此模板支持的买方或委托方默认信息。"],
        guardrail: ["使用范围", "文本", "说明默认方字段适用的模板和不能覆盖的单据内容。"],
      }, { required: ["templateKey", "status", "partyDefaults", "guardrail"] }),
      ...fields("printTemplateDefaults[].partyDefaults", {
        buyerCompany: ["买方 / 委托方名称", "文本", "用于合同抬头的默认名称。"],
        buyerContact: ["买方 / 委托方联系人", "文本", "用于合同默认经办信息；工作区不保存真实员工个人资料。"],
        buyerPhone: ["买方 / 委托方电话", "文本", "未填时不编译空默认值；真实电话按生效配置或单据快照维护。"],
        buyerAddress: ["买方 / 委托方地址", "文本", "用于合同默认方地址；实际打印仍核对单据快照。"],
        buyerSigner: ["买方 / 委托方签字人", "文本", "未填时不编译空默认值；填写姓名也不会生成签章。"],
      }, { keys: schema.allowedPrintPartyDefaultKeys, required: schema.requiredPrintPartyDefaultKeys }),
    ],
  },
  {
    key: "identity",
    label: "版本与发布边界",
    description: "工作区客户包用于检查和预览。目标环境是否生效，以该环境的配置版本读回为准。",
    fields: fields("", {
      customerKey: ["客户标识", "文本", "选择登记客户包和私有部署目标。"],
      packageKey: ["客户包标识", "文本", "以客户标识为命名空间，内容变化时保持稳定。"],
      label: ["客户包名称", "文本", "用于识别当前配置包的可读名称。"],
      status: ["包状态", "枚举", `识别草案、预览和发布输入：${schema.allowedStatuses.join("、")}。此值不表示目标已生效。`],
      runtimeEnabled: ["运行编译资格", "布尔值", "工作区草案为 false，正式编译只接受经登记的发布输入。"],
      sourcePolicy: ["来源和操作限制", "对象", "声明预览、本地测试和发布边界；目标激活由受控流程执行。"],
      boundaries: ["产品边界", "对象", "声明不能改库结构、提高权限或写入库存、出货、财务等业务事实。"],
      revision: ["生成的配置版本", "系统生成", "正式 JSON 清单根据内容生成版本标识，无需手填；目标读回时核对。"],
    }, { required: schema.requiredTopLevelKeys }),
  },
]);
