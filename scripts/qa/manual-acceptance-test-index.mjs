import { buildManualAcceptanceCatalog } from "./manual-acceptance-catalog.mjs";
import { manualAcceptanceAccountSetForTarget } from "./manual-acceptance-account-identities.mjs";
import { getRoleDisplayName } from "../../web/src/erp/utils/roleKeys.mjs";

const cell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");

const QUANTITY_UNITS = Object.freeze({
  products: "产品",
  "product-skus": "SKU",
  "inventory-balances": "余额",
  "inventory-lots": "批次",
  "inventory-txns": "变动",
});

// 只保存定位样本所需的白名单字段，不复制业务 payload 或凭据。
export function selectManualAcceptanceSamples(probe, items) {
  const groups = new Map();
  for (const item of items) {
    const code =
      item.task_code ||
      item.order_no ||
      item.purchase_order_no ||
      item.outsourcing_order_no ||
      item.fact_no ||
      item.receipt_no ||
      item.inspection_no ||
      item.payment_no ||
      item.credit_note_no ||
      item.reservation_no ||
      item.shipment_no ||
      item.decision_no ||
      item.txn_no ||
      item.operation_no ||
      item.code ||
      item.version ||
      String(item.id);
    const state =
      typeof item[probe.statusField] === "boolean"
        ? item[probe.statusField]
          ? "启用"
          : "停用"
        : String(item[probe.statusField] || "—");
    const kind =
      item.kind && item.direction
        ? `${item.kind} / ${item.direction}`
        : String(
            item[probe.secondaryField] ||
              item.direction ||
              item.task_group ||
              "—",
          );
    const deadline = item.due_at
      ? new Date(Number(item.due_at) * 1000).toISOString().slice(0, 10)
      : "";
    const title = String(
      item.task_name || item.name || item.product_name || "",
    );
    const key = JSON.stringify([
      kind,
      state,
      probe.listKey === "tasks" ? title : "",
      deadline,
    ]);
    const group = groups.get(key) || [];
    if (group.length < 3)
      group.push({ id: item.id, code, title, state, kind, dueDate: deadline });
    groups.set(key, group);
  }
  return [...groups.values()].flat();
}

export function renderManualAcceptanceTestIndex(report) {
  if (
    report.mode !== "verify" ||
    !Array.isArray(report.targets) ||
    !Array.isArray(report.probes)
  )
    throw new Error("test index requires a live readiness readback");
  const catalog = buildManualAcceptanceCatalog();
  const accounts = manualAcceptanceAccountSetForTarget(report.target);
  const accountLabel = (role) => {
    const key = role === "system_admin" ? "admin" : role;
    const username = accounts.roleUsernames[key];
    if (!username)
      throw new Error(`test index has an unregistered account role ${role}`);
    return `${key === "admin" ? "系统管理员" : getRoleDisplayName(key)} / ${username}`;
  };
  const guides = new Map(
    Object.entries(catalog.technicalManifest).flatMap(([group, items]) =>
      Array.isArray(items)
        ? items.flatMap((item, index) =>
            item?.key
              ? [[item.key, catalog.acceptanceGuide[group]?.[index]]]
              : [],
          )
        : [],
    ),
  );
  const probes = new Map(report.probes.map((probe) => [probe.id, probe]));
  const lines = [
    "# 手测样本索引",
    "",
    `数据批次：${report.dataVersion} / ${report.runId}。核对时间：${report.generatedAt}。`,
    "",
    "以下记录来自当前批次的实际读取。每个类型与状态列出最多三条定位样本；日期变化或人工办理后，请重新运行同批只读核对。",
    "",
    "固定对照样本与可操作记录共用正式业务规则。办理后按业务流程保留结果；重测使用受控补充或新隔离批次，不回拨已过账状态。",
    "",
    "| 页面 | 账号 | 数据核对 | 数量 |",
    "| --- | --- | --- | ---: |",
  ];
  for (const target of report.targets) {
    const actors = [
      ...new Set(
        target.probeIds.map((id) => probes.get(id)?.roleKey).filter(Boolean),
      ),
    ];
    const quantities = target.probeIds.flatMap((id) => {
      const probe = probes.get(id);
      return QUANTITY_UNITS[id] && Number.isInteger(probe?.actual)
        ? [`${probe.actual} ${QUANTITY_UNITS[id]}`]
        : [];
    });
    lines.push(
      `| ${cell(target.title)} | ${cell(actors.map(accountLabel).join("、") || "当前登录账号")} | ${cell(target.dataStatus)} | ${cell(quantities.length > 1 ? quantities.join(" / ") : target.actual)} |`,
    );
  }
  for (const target of report.targets) {
    const guide = guides.get(target.key);
    lines.push(
      "",
      `## ${target.title}`,
      "",
      `入口：\`${target.route}\`。数据核对：${target.dataStatus}。`,
    );
    if (guide?.whatToDo?.length)
      lines.push("", ...guide.whatToDo.map((step, i) => `${i + 1}. ${step}`));
    for (const id of target.probeIds) {
      const probe = probes.get(id);
      if (!probe?.samples?.length) continue;
      lines.push(
        "",
        `使用账号：${accountLabel(probe.roleKey)}。`,
        "",
        "| 类型 | 状态 | 单号或编号 | 内容 | 截止日期 |",
        "| --- | --- | --- | --- | --- |",
      );
      for (const sample of probe.samples)
        lines.push(
          `| ${cell(sample.kind)} | ${cell(sample.state)} | ${cell(sample.code)} | ${cell(sample.title)} | ${cell(sample.dueDate)} |`,
        );
    }
    if (target.dataStatus !== "pass")
      lines.push("", `待补证据：${target.reason || "请核对对应数据报告"}。`);
  }
  return `${lines.join("\n")}\n`;
}
