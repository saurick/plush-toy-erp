import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { yoyoosunMenuConfig } from "../../config/customers/yoyoosun/menuConfig.mjs";
import { yoyoosunRoleFlowMatrix } from "../../config/customers/yoyoosun/roleFlowMatrix.mjs";
import { getNavigationSections } from "../../web/src/erp/config/seedData.mjs";
import { printTemplateCatalog } from "../../web/src/erp/config/printTemplates.mjs";
import {
  buildManualAcceptanceCatalog,
  parseManualAcceptanceCatalogArgs,
  renderManualAcceptanceJson,
  renderManualAcceptanceMarkdown,
  runManualAcceptanceCatalogCli,
} from "./manual-acceptance-catalog.mjs";

function flattenTechnicalManifest(catalog) {
  return [
    ...catalog.technicalManifest.entries,
    ...catalog.technicalManifest.desktopPages,
    ...catalog.technicalManifest.mobileRolePages,
    ...catalog.technicalManifest.printPreviewPages,
    ...catalog.technicalManifest.printWorkspacePages,
  ];
}

function flattenAcceptanceGuide(catalog) {
  return [
    ...catalog.acceptanceGuide.entries,
    ...catalog.acceptanceGuide.desktopPages,
    ...catalog.acceptanceGuide.mobileRolePages,
    ...catalog.acceptanceGuide.printPreviewPages,
    ...catalog.acceptanceGuide.printWorkspacePages,
  ];
}

function minimumRecordsByKey(items) {
  return Object.fromEntries(
    items.map((item) => [item.key, item.minimumRecords]),
  );
}

test("manual acceptance catalog derives the complete current yoyoosun page inventory", () => {
  const catalog = buildManualAcceptanceCatalog();
  const expectedDesktopItems = getNavigationSections(
    yoyoosunMenuConfig,
  ).flatMap((section) => section.items);

  assert.equal(catalog.summary.entryPages, 2);
  assert.equal(catalog.summary.desktopPages, 27);
  assert.equal(catalog.summary.mobileRolePages, 9);
  assert.equal(catalog.summary.printPreviewPages, 5);
  assert.equal(catalog.summary.printWorkspacePages, 5);
  assert.equal(catalog.summary.totalScenarios, 48);
  assert.deepEqual(
    catalog.technicalManifest.desktopPages.map((item) => item.key),
    expectedDesktopItems.map((item) => item.key),
  );
  assert.deepEqual(
    new Set(catalog.technicalManifest.mobileRolePages.map((item) => item.key)),
    new Set(yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey)),
  );
  assert.deepEqual(
    catalog.technicalManifest.printPreviewPages.map((item) => item.key),
    printTemplateCatalog.map((template) => template.key),
  );
  assert.deepEqual(
    catalog.technicalManifest.printWorkspacePages.map((item) => item.key),
    printTemplateCatalog.map((template) => template.key),
  );
});

test("manual acceptance catalog excludes hidden and development-only pages", () => {
  const catalog = buildManualAcceptanceCatalog();
  const allTechnical = flattenTechnicalManifest(catalog);
  const serialized = JSON.stringify(allTechnical);

  for (const hiddenKey of yoyoosunMenuConfig.desktopMenu.hiddenItemKeys) {
    assert(
      !catalog.technicalManifest.desktopPages.some(
        (item) => item.key === hiddenKey,
      ),
      `${hiddenKey} must stay excluded from the desktop acceptance inventory`,
    );
  }
  assert(!serialized.includes("__dev"));
  assert(!serialized.includes("/erp/__dev"));
});

test("manual acceptance catalog keeps technical routing separate from customer-facing steps", () => {
  const catalog = buildManualAcceptanceCatalog();
  const guides = flattenAcceptanceGuide(catalog);
  const customerFacingCopy = JSON.stringify(catalog.acceptanceGuide);
  const forbiddenBusinessCopy =
    /Workflow|Fact|JSON-RPC|RBAC|raw\s*id|\b(?:key|route|boss|sales|purchase|production|warehouse|finance|pmc|quality|engineering|system_admin)\b|岗位代码|甲方/i;

  assert.doesNotMatch(customerFacingCopy, forbiddenBusinessCopy);
  assert(!customerFacingCopy.includes("/erp/"));
  assert(!customerFacingCopy.includes("__dev"));
  assert(!customerFacingCopy.includes(".mjs"));
  for (const item of guides) {
    assert.deepEqual(Object.keys(item).sort(), [
      "keyStates",
      "minimumData",
      "roles",
      "title",
      "whatToDo",
      "whatToSee",
    ]);
    assert(item.title);
    assert(item.roles.length > 0);
    assert(item.minimumData);
    assert(item.keyStates.length >= 4);
    assert(item.whatToDo.length >= 2);
    assert(item.whatToSee.length >= 2);
    assert(item.whatToDo.every((step) => step.startsWith("你要")));
    assert(item.whatToSee.every((step) => step.startsWith("应看到")));
  }
});

test("manual acceptance catalog locks the current deliverable data quantity for every key", () => {
  const catalog = buildManualAcceptanceCatalog();
  const allTechnical = flattenTechnicalManifest(catalog);

  for (const item of allTechnical) {
    assert(item.key, "every technical item needs a key");
    assert(item.route.startsWith("/"), `${item.key} needs an absolute route`);
    assert.equal(typeof item.isList, "boolean");
    assert(Number.isInteger(item.minimumRecords));
    assert(item.minimumRecordUnit);
    assert(item.roleKeys.length > 0);
  }

  assert.deepEqual(minimumRecordsByKey(catalog.technicalManifest.entries), {
    "admin-login": 10,
    entry: 10,
  });
  assert.deepEqual(
    minimumRecordsByKey(catalog.technicalManifest.desktopPages),
    {
      "global-dashboard": 180,
      "task-board": 20,
      customers: 60,
      suppliers: 60,
      products: 20,
      materials: 80,
      "sales-orders": 45,
      "material-bom": 45,
      processes: 30,
      "accessories-purchase": 45,
      "quality-inspections": 54,
      inbound: 54,
      inventory: 45,
      "processing-contracts": 45,
      "production-orders": 45,
      "production-scheduling": 20,
      "production-progress": 45,
      "production-exceptions": 20,
      outbound: 45,
      shipments: 45,
      reconciliation: 45,
      payables: 45,
      receivables: 45,
      invoices: 45,
      "print-center": 5,
      "permission-center": 10,
      "system-audit-logs": 30,
    },
  );
  assert.deepEqual(
    minimumRecordsByKey(catalog.technicalManifest.mobileRolePages),
    {
      boss: 20,
      sales: 20,
      purchase: 20,
      production: 20,
      warehouse: 20,
      finance: 20,
      pmc: 20,
      quality: 20,
      engineering: 20,
    },
  );
  assert.deepEqual(
    minimumRecordsByKey(catalog.technicalManifest.printPreviewPages),
    Object.fromEntries(
      printTemplateCatalog.map((template) => [template.key, 1]),
    ),
  );
  assert.deepEqual(
    minimumRecordsByKey(catalog.technicalManifest.printWorkspacePages),
    Object.fromEntries(
      printTemplateCatalog.map((template) => [template.key, 5]),
    ),
  );
});

test("manual acceptance catalog treats production and outbound pages as source-grounded read-only checks", () => {
  const catalog = buildManualAcceptanceCatalog();
  const byTitle = new Map(
    catalog.acceptanceGuide.desktopPages.map((item) => [item.title, item]),
  );
  const production = byTitle.get("生产进度");
  const outbound = byTitle.get("出库管理");

  assert(production);
  assert(outbound);
  assert.match(
    production.whatToDo.join("\n"),
    /正式生产任务.*已准备的试用记录/u,
  );
  assert.match(outbound.whatToDo.join("\n"), /出货单处理.*已准备的试用记录/u);
  assert.match(production.whatToSee.join("\n"), /不提供无来源的新建入口/u);
  assert.match(outbound.whatToSee.join("\n"), /不提供无来源的新建入口/u);
  assert.doesNotMatch(
    [...production.whatToDo, ...outbound.whatToDo].join("\n"),
    /新建|创建并释放|再提交/u,
  );
});

test("manual acceptance catalog assigns production orders to production with source-driven actions", () => {
  const catalog = buildManualAcceptanceCatalog();
  const technical = catalog.technicalManifest.desktopPages.find(
    (item) => item.key === "production-orders",
  );
  const acceptance = catalog.acceptanceGuide.desktopPages.find(
    (item) => item.title === "生产订单",
  );

  assert.deepEqual(technical?.roleKeys, ["production"]);
  assert.equal(technical?.minimumRecords, 45);
  assert.match(acceptance?.whatToDo.join("\n") || "", /已发布.*领料草稿.*完工草稿/u);
  assert.match(
    acceptance?.whatToSee.join("\n") || "",
    /生产记录中过账后才会影响库存/u,
  );
});

test("boss trial tasks do not pretend generic records are formal order approvals", () => {
  const catalog = buildManualAcceptanceCatalog();
  const boss = catalog.acceptanceGuide.mobileRolePages.find((item) =>
    item.title.startsWith("老板 / 管理审批"),
  );

  assert(boss);
  assert.match(boss.whatToDo.join("\n"), /销售订单正常提交后生成的审批事项/u);
  assert.match(boss.whatToDo.join("\n"), /退回.*阻塞原因/su);
  assert.doesNotMatch(boss.whatToDo.join("\n"), /选择同意或退回/u);
  assert.match(boss.whatToSee.join("\n"), /不会冒充正式订单审批/u);
});

test("manual acceptance catalog separates fixed previews from business-filled workspaces", () => {
  const catalog = buildManualAcceptanceCatalog();
  const previews = catalog.acceptanceGuide.printPreviewPages;
  const workspaces = catalog.acceptanceGuide.printWorkspacePages;

  for (const preview of previews) {
    assert.match(preview.minimumData, /^1 固定/u);
    assert(preview.keyStates.includes("固定默认样例"));
    assert.match(preview.whatToDo.join("\n"), /固定默认样例/u);
    assert.match(preview.whatToSee.join("\n"), /业务带值需从对应业务页面进入/u);
    assert.doesNotMatch(preview.whatToDo.join("\n"), /业务数据|25 条|刷新/u);
  }

  assert.match(workspaces[0].whatToDo.join("\n"), /从采购订单.*25 条.*刷新/su);
  assert.match(workspaces[1].whatToDo.join("\n"), /从委外订单.*25 条.*刷新/su);
  for (const workspace of workspaces.slice(2)) {
    assert.match(workspace.whatToDo.join("\n"), /从产品结构管理/u);
    assert.match(workspace.whatToDo.join("\n"), /刷新/u);
  }
  const colorCard = workspaces.find((item) => item.title === "色卡打印工作台");
  assert(colorCard);
  assert.match(colorCard.whatToSee.join("\n"), /线下贴.*不上传图片也能/u);
  assert.doesNotMatch(colorCard.whatToDo.join("\n"), /上传|更换.*图片/u);
});

test("formal customer checklist keeps all 48 targets and client-facing truth", () => {
  const checklist = fs.readFileSync(
    new URL(
      "../../docs/customers/yoyoosun/试用人员全页面手工验收清单.md",
      import.meta.url,
    ),
    "utf8",
  );
  const forbiddenCustomerCopy =
    /Workflow|Fact|JSON-RPC|RBAC|raw\s*id|\b(?:key|route|system_admin)\b|岗位代码|甲方|\/erp\//i;
  const targetHeadings = checklist.match(
    /^### (?:进入|桌面|岗位|预览|打印)-\d{2} /gmu,
  );

  assert.equal(targetHeadings?.length, 48);
  assert.doesNotMatch(checklist, forbiddenCustomerCopy);
  assert.match(checklist, /10 个正式岗位试用账号/u);
  assert.doesNotMatch(checklist, /13 个(?:不同岗位组合的)?试用账号/u);
  assert.match(checklist, /54 条来料质检记录/u);
  assert.match(checklist, /54 条采购入库记录/u);
  assert.match(checklist, /45 张生产订单/u);
  assert.match(checklist, /生产订单.*领料草稿.*完工草稿/su);
  assert.match(checklist, /生产订单.*只有在生产记录中过账后才影响库存/su);
  assert.match(checklist, /生产进度.*只读|本页不提供新建入口/su);
  assert.match(checklist, /出库管理.*只读|本页不提供新建入口/su);
  assert.match(checklist, /模板预览只检查系统提供的固定默认样例/u);
  assert.match(checklist, /线下贴样/u);
  assert.match(checklist, /不要求上传图片/u);
  assert.match(checklist, /销售订单正常提交后生成的审批事项验收/u);
  assert.doesNotMatch(checklist, /订单摘要后同意一条/u);
  assert.doesNotMatch(checklist, /名称、单号或备注统一带/u);
});

test("manual acceptance catalog derives five preview and five fresh-workspace routes", () => {
  const catalog = buildManualAcceptanceCatalog();
  const templateKeys = printTemplateCatalog.map((template) => template.key);
  const roleByKey = new Map(
    yoyoosunRoleFlowMatrix.roles.map((role) => [role.roleKey, role]),
  );
  const routerSource = fs.readFileSync(
    new URL("../../web/src/erp/router.jsx", import.meta.url),
    "utf8",
  );

  assert.match(routerSource, /path="print-center\/:templateKey"/);
  assert.match(routerSource, /path="\/erp\/print-workspace\/:templateKey"/);

  assert.deepEqual(
    catalog.technicalManifest.printPreviewPages.map((item) => item.route),
    templateKeys.map((key) => `/erp/print-center/${key}`),
  );
  assert.deepEqual(
    catalog.technicalManifest.printWorkspacePages.map((item) => item.route),
    templateKeys.map((key) => `/erp/print-workspace/${key}?draft=fresh`),
  );
  for (const item of [
    ...catalog.technicalManifest.printPreviewPages,
    ...catalog.technicalManifest.printWorkspacePages,
  ]) {
    for (const roleKey of item.roleKeys) {
      const role = roleByKey.get(roleKey);
      assert(role.menuSurfaces.includes("print-center"));
      assert(role.capabilityKeys.includes("erp.print_template.read"));
    }
  }
});

test("manual acceptance catalog default run stays stdout-only and never calls a backend", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  let stdout = "";
  globalThis.fetch = () => {
    fetchCalled = true;
    throw new Error("unexpected backend call");
  };

  try {
    const result = runManualAcceptanceCatalogCli(
      { format: "json", out: "", help: false },
      { stdout: { write: (chunk) => (stdout += chunk) } },
    );
    assert.equal(fetchCalled, false);
    assert.deepEqual(result.writtenPaths, []);
    assert.equal(JSON.parse(stdout).summary.totalScenarios, 48);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual acceptance catalog renders Chinese Markdown and JSON", () => {
  const catalog = buildManualAcceptanceCatalog();
  const markdown = renderManualAcceptanceMarkdown(catalog);
  const json = renderManualAcceptanceJson(catalog);

  assert.match(markdown, /# 东莞市永绅玩具有限公司全页面手动验收目录/);
  assert.match(markdown, /\| 桌面后台 \| 27 \|/);
  assert.match(markdown, /你要做什么/);
  assert.match(markdown, /应看到什么/);
  assert.match(markdown, /采购合同预览/);
  assert.match(markdown, /作业指导书打印工作台/);
  assert.doesNotMatch(markdown, /Workflow|Fact|JSON-RPC|RBAC|raw\s*id|甲方/i);

  const parsed = JSON.parse(json);
  assert.equal(parsed.summary.totalScenarios, 48);
  assert.equal(parsed.technicalManifest.desktopPages.length, 27);
});

test("manual acceptance catalog CLI parses formats and writes local report artifacts", () => {
  assert.deepEqual(parseManualAcceptanceCatalogArgs([]), {
    format: "markdown",
    out: "",
    help: false,
  });
  assert.deepEqual(
    parseManualAcceptanceCatalogArgs(["--format", "json", "--out", "output/a"]),
    { format: "json", out: "output/a", help: false },
  );
  assert.throws(
    () => parseManualAcceptanceCatalogArgs(["--format", "yaml"]),
    /markdown 或 json/,
  );

  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "manual-acceptance-catalog-"),
  );
  let stdout = "";
  const result = runManualAcceptanceCatalogCli(
    { format: "markdown", out: outDir },
    { stdout: { write: (chunk) => (stdout += chunk) } },
  );

  assert.equal(result.writtenPaths.length, 2);
  assert(fs.existsSync(path.join(outDir, "manual-acceptance-catalog.md")));
  assert(fs.existsSync(path.join(outDir, "manual-acceptance-catalog.json")));
  assert.match(stdout, /已写入本地验收目录/);
});
