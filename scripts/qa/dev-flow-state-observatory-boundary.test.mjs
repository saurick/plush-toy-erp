import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  DEV_FLOW_STATE_CATALOG,
  DEV_FLOW_STATE_ROUTE,
} from "../../web/src/dev-workbench/config/devFlowStateCatalog.mjs";
import {
  buildBusinessChainSelectOptions,
  buildFactDefinitionSelectOptions,
  buildStateDefinitionSelectOptions,
} from "../../web/src/dev-workbench/pages/devFlowDefinitionSelectOptions.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("dev flow state observatory: route and all catalogs stay DEV-only and read-only", () => {
  const catalog = DEV_FLOW_STATE_CATALOG;
  const devRoutes = read("web/src/dev-workbench/config/devRoutes.mjs");
  const workbenchRoutes = read("web/src/dev-workbench/DevWorkbenchRoutes.jsx");
  const router = read("web/src/erp/router.jsx");
  const formalMenus = [
    read("web/src/erp/config/menuPermissions.mjs"),
    read("web/src/erp/config/seedData.mjs"),
  ].join("\n");

  assert.equal(DEV_FLOW_STATE_ROUTE, "/__dev/status-flows");
  assert.match(devRoutes, /\/__dev\/status-flows/u);
  assert.match(
    workbenchRoutes,
    /import\(['"]\.\/pages\/DevFlowStateObservatoryPage\.jsx['"]\)/u,
  );
  assert.match(
    workbenchRoutes,
    /path="status-flows"[\s\S]{0,120}?<DevFlowStateObservatoryPage/u,
  );
  assert.match(
    router,
    /import\.meta\.env\.DEV[\s\S]{0,220}?DevWorkbenchRoutes/u,
  );
  assert.doesNotMatch(formalMenus, /\/__dev\/status-flows/u);

  assert.equal(catalog.readOnly, true);
  assert.equal(catalog.allowsActionExecution, false);
  assert.equal(catalog.allowsGenericStatusWrite, false);
  assert.deepEqual(catalog.writeApis, []);
  assert.equal(catalog.businessChainCoverage.complete, true);
  assert.equal(catalog.businessChainCoverage.overviewComplete, true);
  assert.equal(catalog.factLedgerCoverage.complete, true);
  assert.equal(catalog.factRuntimeQuery.availability, "unavailable");
  assert.equal(catalog.businessChainOverview.key, "all");
  assert.equal(catalog.businessChainOverview.readOnly, true);
  assert.equal(catalog.businessChainOverview.relations.length, 16);
  assert.equal(catalog.businessChains.length, 12);
  assert.equal(
    catalog.businessChains.some((chain) => chain.key === "all"),
    false,
    "the read-only overview must not become a fake thirteenth business chain",
  );
  assert(catalog.businessChains.every((chain) => chain.readOnly));
  assert(catalog.factDefinitions.every((fact) => fact.readOnly));
});

test("dev flow state observatory: five-view information architecture explains people, path, ledger, rules, and chain", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );

  assert.match(
    page,
    /import\.meta\.glob\(['"]\.\.\/config\/devFlowStateCatalog\.mjs['"]\)/u,
  );
  assert.match(page, /moduleValue\?\.DEV_FLOW_STATE_CATALOG/u);
  for (const copy of [
    "业务链与运行观察台",
    "Workflow 管“人”",
    "ProcessRuntime 管“路”",
    "Fact / Ledger 管“账”",
    "状态机管“规则”",
    "业务链负责串起来",
    "看业务链",
    "查责任与任务",
    "看运行路径",
    "看已生效结果",
    "查状态规则",
    "基础资料提供标准",
    "例如客户、供应商、产品、材料和仓库",
    "来源单据记录承诺",
    "例如销售订单、采购订单、生产订单和加工合同",
    "但不代表库存、出货或财务结果已经发生",
    "受控业务动作负责真正执行",
    "计算结果由正式来源和事实派生",
    "权限、客户配置与审计贯穿全部视图",
    "不单独构成业务链",
  ]) {
    assert(page.includes(copy), `missing visible boundary copy: ${copy}`);
  }
  assert.deepEqual(
    [...page.matchAll(/value:\s*'([^']+)'[\s\S]{0,100}?label:/gu)]
      .slice(0, 5)
      .map((match) => match[1]),
    ["chain", "workflow", "runtime", "facts", "states"],
  );
  assert.match(page, /const DEFAULT_VIEW = 'chain'/u);
  assert.match(
    page,
    /把基础资料、来源单据、人、路、业务动作、账、规则和计算结果串起来/u,
  );
  assert.equal(
    DEV_FLOW_STATE_CATALOG.businessChainOverview.label,
    "全部业务链（设计总图）",
  );
  assert.match(page, /<Title level=\{2\}>\{overview\.label\}<\/Title>/u);
  assert.match(page, /catalog\.businessChainOverview\.key/u);
  assert.match(page, /buildBusinessChainSelectOptions\(catalog\)/u);
  assert.match(page, /总图只画链与链的衔接/u);
  assert.match(page, /12 个节点分别代表 12 条真实业务链/u);
  assert.match(page, /一次只看一条业务链/u);
  assert.match(page, /业务链先看步骤，再查运行证据/u);
  assert.match(page, /查询任务后，只高亮真实运行到的一个步骤/u);
  assert.match(page, /具体运行实例/u);
  for (const businessCopy of [
    "业务单据",
    "基础资料",
    "流程运行",
    "岗位协同",
    "已生效业务记录",
    "计算结果",
    "查看一笔任务现在走到哪一步",
    "按步骤看业务链",
    "这一步做什么",
    "谁来处理",
    "怎样算完成",
    "异常时怎么办",
    "查看开发者信息",
  ]) {
    assert(
      page.includes(businessCopy),
      `missing business-first copy: ${businessCopy}`,
    );
  }
  assert.match(
    page,
    /<div className="erp-dev-flow-overview-graph erp-dev-docs-markdown">/u,
  );
  assert.match(
    page,
    /<div className="erp-dev-flow-chain-graph erp-dev-docs-markdown">/u,
  );
  assert.doesNotMatch(page, /erp-dev-flow-graph-disclosure/u);
  assert.doesNotMatch(page, /查看完整链间关系图|查看完整步骤关系图/u);
  assert.match(page, /<summary>查看查询边界与开发者信息<\/summary>/u);
  assert.match(page, /<dt>稳定 key<\/dt>/u);
});

test("dev flow state observatory: long definition selects are grouped without changing ProcessRuntime order", () => {
  const catalog = DEV_FLOW_STATE_CATALOG;
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const styles = read(
    "web/src/dev-workbench/styles/dev-flow-state-observatory.css",
  );
  const chainOptions = buildBusinessChainSelectOptions(catalog);
  const factOptions = buildFactDefinitionSelectOptions(catalog);
  const stateOptions = buildStateDefinitionSelectOptions(catalog);

  assert.deepEqual(
    chainOptions.slice(1).map((group) => group.label),
    ["履约主链 · 3", "供给与库存支撑 · 3", "异常与返工 · 4", "冲正与纠正 · 2"],
  );
  assert.deepEqual(
    factOptions.map((group) => group.label),
    ["采购与质量 · 5", "生产与库存 · 8", "委外与返工 · 3", "出货与财务 · 6"],
  );
  assert.equal(
    stateOptions.flatMap((group) => group.options).length,
    catalog.flows.length,
  );
  assert.match(page, /buildFactDefinitionSelectOptions\(catalog\)/u);
  assert.match(page, /buildStateDefinitionSelectOptions\(catalog\)/u);
  assert.match(page, /optionRender=\{renderDefinitionSelectOption\}/u);
  assert.match(page, /options=\{catalog\.processDefinitions\.map/u);
  assert.match(styles, /erp-dev-flow-definition-select-popup/u);
  assert.match(styles, /erp-dev-flow-definition-option__key/u);
});

test("dev flow state observatory: English anchors stay paired with the concept layers", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const taskNav = read("web/src/dev-workbench/components/DevTaskNav.jsx");

  for (const [label, englishLabel] of [
    ["看业务链", "Business Chain"],
    ["查责任与任务", "Workflow / Task"],
    ["看运行路径", "ProcessRuntime"],
    ["看已生效结果", "Fact / Ledger"],
    ["查状态规则", "State Machine"],
  ]) {
    assert(
      page.includes(`label: '${label}',\n    englishLabel: '${englishLabel}',`),
      `missing English anchor for ${label}`,
    );
  }
  assert.match(taskNav, /item\.englishLabel/u);
  assert.match(taskNav, /erp-dev-task-nav__english-label/u);
  assert.match(taskNav, /lang="en"/u);
});

test("dev flow state observatory: pasted business text search is local, grouped, and IME-safe", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const helper = read(
    "web/src/dev-workbench/pages/devFlowDefinitionSearch.mjs",
  );
  const searchStart = page.indexOf("function DefinitionSearch");
  const searchEnd = page.indexOf("\nfunction ContextStrip", searchStart);
  const pageIndexStart = page.indexOf(
    '<details className="erp-dev-flow-definition-tools">',
    searchEnd,
  );
  const primaryNavStart = page.indexOf(
    '<section className="erp-dev-flow-nav">',
    pageIndexStart,
  );
  assert(searchStart >= 0 && searchEnd > searchStart);
  assert(
    pageIndexStart > searchEnd && primaryNavStart > pageIndexStart,
    "definition index must be page-level and render before the five primary tabs",
  );
  const search = page.slice(searchStart, searchEnd);

  for (const group of [
    "label: '业务链'",
    "label: 'Workflow'",
    "label: 'ProcessRuntime'",
    "label: '状态机'",
    "label: 'Fact / Ledger'",
  ]) {
    assert(helper.includes(group), `missing grouped result: ${group}`);
  }
  assert.match(
    search,
    /<strong>\{item\.label\}<\/strong>[\s\S]{0,220}?<code>\{item\.key\}<\/code>/u,
  );
  assert.match(search, /跨视图查定义/u);
  assert.match(search, /覆盖 5 个视图/u);
  assert.match(search, /这是本页 5[\s\S]{0,40}?个视图的定义总索引/u);
  assert.match(search, /不属于当前 Tab/u);
  assert.match(search, /例如：销售订单、销售 PMC、已提交/u);
  assert.match(
    search,
    /这个框查目录定义，不查具体任务、运行实例或真实业务记录/u,
  );
  assert.match(search, /点击示例会直接带入并搜索/u);
  assert.match(search, /去查真实任务/u);
  assert.match(search, /const keyword = draftKeyword/u);
  assert.match(
    search,
    /clearSearch\(\)[\s\S]{0,100}?onOpenTaskLookup\(keyword\)/u,
  );
  assert.match(search, /没有匹配定义/u);
  assert.match(search, /onCompositionStart/u);
  assert.match(search, /onCompositionEnd/u);
  assert.match(search, /event\.nativeEvent\.isComposing/u);
  assert.match(search, /erp-dev-flow-search-results/u);
  assert.doesNotMatch(search, /setSearchParams|QUERY_KEYS\.search/u);
  assert.match(helper, /normalizedValue\.includes\(normalizedTerm\)/u);
  assert.match(
    helper,
    /allowEmbedded[\s\S]{0,120}?normalizedTerm\.includes\(normalizedValue\)/u,
  );
  assert.match(helper, /processDefinitionKeys/u);
  assert.match(helper, /flow\.states/u);
  assert.match(helper, /definition\.sourceDocument/u);
  assert.match(page, /taskLookupFocusRequest/u);
  assert.match(page, /document\.getElementById\('dev-flow-task-search'\)/u);
  assert.match(
    page,
    /scrollIntoView\(\{ behavior: 'auto', block: 'center' \}\)/u,
  );
  assert.match(page, /focus\(\{ preventScroll: true \}\)/u);
  assert.match(
    page,
    /onOpenTaskLookup=\{\(keyword\) => \{[\s\S]{0,260}?setTaskDraft\(nextDraft\)[\s\S]{0,220}?openView\('workflow'\)/u,
  );
});

test("dev flow state observatory: deep links fail closed and keep chain return context", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );

  for (const queryKey of [
    "view: 'view'",
    "chain: 'chain'",
    "node: 'node'",
    "flow: 'flow'",
    "state: 'state'",
    "process: 'process'",
    "fact: 'fact'",
    "taskId: 'task_id'",
  ]) {
    assert(page.includes(queryKey), `missing deep-link key: ${queryKey}`);
  }
  assert.doesNotMatch(page, /search: 'q'/u);
  assert.match(page, /function invalidQueryMessages/u);
  assert.match(page, /未知 query 参数/u);
  assert.match(page, /query 参数重复/u);
  assert.match(page, /未知或过期业务链/u);
  assert.match(page, /未知 Fact Key/u);
  assert.match(page, /task_id 必须是大于 0 的整数/u);
  assert.match(page, /无效或过期深链接，已按 fail closed 停止加载/u);
  assert.match(page, /业务总图不接受单链节点参数/u);
  assert.match(page, /恢复到业务总图/u);
  assert.match(page, /chain: catalog\.businessChainOverview\.key/u);
  assert.match(page, /<ContextStrip[\s\S]{0,420}?onReturnChain/u);
  assert.match(page, /返回业务链/u);
  assert.match(page, /data-selected-chain-node/u);
  assert.match(page, /data-business-chain-overview/u);
  assert.match(page, /data-overview-chain/u);
  assert.match(page, /data-overview-relation/u);
});

test("dev flow state observatory: task selection stays in the URL without leaking into the global context strip", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const contextStart = page.indexOf("function ContextStrip");
  const contextEnd = page.indexOf("\nfunction TaskLookupResults", contextStart);
  const selectionStart = page.indexOf("const specialistSelection =");
  const selectionEnd = page.indexOf("\n\n  const renderView", selectionStart);
  const workflowStart = page.indexOf("function WorkflowView");
  const workflowEnd = page.indexOf(
    "\nfunction ProcessDefinitionCard",
    workflowStart,
  );
  const runtimeStart = page.indexOf("function RuntimeView");
  const runtimeEnd = page.indexOf("\nfunction FactsView", runtimeStart);

  assert(contextStart >= 0 && contextEnd > contextStart);
  assert(selectionStart >= 0 && selectionEnd > selectionStart);
  assert(workflowStart >= 0 && workflowEnd > workflowStart);
  assert(runtimeStart >= 0 && runtimeEnd > runtimeStart);

  const context = page.slice(contextStart, contextEnd);
  const specialistSelection = page.slice(selectionStart, selectionEnd);
  const workflow = page.slice(workflowStart, workflowEnd);
  const runtime = page.slice(runtimeStart, runtimeEnd);

  assert.doesNotMatch(context, /taskId|真实任务上下文|task_id/u);
  assert.doesNotMatch(specialistSelection, /workflow|taskId|任务 \$\{/u);
  assert.match(
    page,
    /const taskId = cleanText\(searchParams\.get\(QUERY_KEYS\.taskId\)\)/u,
  );
  assert.match(
    page,
    /updateParams\(\{ \[QUERY_KEYS\.taskId\]: String\(nextTaskId\) \}\)/u,
  );
  assert.match(workflow, /<TaskFinder/u);
  assert.match(runtime, /<TaskFinder/u);
});

test("dev flow state observatory: task-name lookup and unlinked runtime boundary remain exact", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const helper = read("web/src/dev-workbench/pages/devFlowStateTaskLookup.mjs");

  for (const copy of [
    "查找后台任务",
    "粘贴完整任务名称、任务编号、来源单号或数字 task_id",
    "电脑端后台「任务看板」",
    "从电脑端后台「任务看板」复制完整任务名称",
    "数字 task_id 仅用于开发排障",
    "名称可能重复",
    "已找到任务，但它是模拟展示数据",
    "已找到任务，但它没有正式流程轨迹",
    "未关联正式 ProcessRuntime",
  ]) {
    assert(page.includes(copy), `missing task lookup copy: ${copy}`);
  }
  assert.match(page, /无需数据库\s*ID/u);
  assert.match(
    page,
    /listWorkflowTasks\(query,\s*\{ signal: controller\.signal \}\)/u,
  );
  assert.match(page, /listWorkflowTaskEvents\(Number\(taskId\)/u);
  assert(
    page.includes(
      "getWorkflowTaskProcessContext(Number(taskId), { signal: controller.signal })",
    ),
  );
  assert.match(
    page,
    /association ===[\s\n]*DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION\.UNLINKED[\s\S]{0,260}?return undefined/u,
  );
  assert.match(
    page,
    /isDevFlowStateTaskUnlinkedRuntimeError\(error\)[\s\S]{0,220}?status: 'unlinked'/u,
  );
  assert.match(page, /function RuntimeUnlinkedTaskBoundary/u);
  assert.match(
    page,
    /data-task-runtime-boundary=\{displayOnly \? 'display-only' : 'unlinked'\}/u,
  );
  assert.match(
    helper,
    /DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION[\s\S]{0,340}?UNKNOWN:[\s\S]{0,120}?LINKED:[\s\S]{0,120}?UNLINKED:[\s\S]{0,120}?INVALID:/u,
  );
  assert.match(
    helper,
    /\[task\.task_name, task\.task_code, task\.source_no\]/u,
  );
  assert.match(
    helper,
    /cleanText\(error\?\.message\) === '当前任务未关联正式流程'/u,
  );
  assert.doesNotMatch(
    page,
    /尚未查询运行数据。可按任务名称、任务编号、来源单号或 task_id/u,
  );
});

test("dev flow state observatory: Runtime completion never promotes Workflow or Fact completion", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const chainStart = page.indexOf("function BusinessChainView");
  const chainEnd = page.indexOf("\nfunction WorkflowView", chainStart);
  const chain = page.slice(chainStart, chainEnd);
  const overviewStart = page.indexOf("function BusinessChainOverviewView");
  const overviewEnd = page.indexOf(
    "\nfunction BusinessChainView",
    overviewStart,
  );
  const overview = page.slice(overviewStart, overviewEnd);

  assert.match(chain, /item\.processKeys\.includes\(runtimeProcessKey\)/u);
  assert.match(chain, /data-runtime-current/u);
  assert.match(overview, /matchingChain\?\.key/u);
  assert.match(overview, /总图最多只高亮这笔任务所属的一条业务链/u);
  assert.match(overview, /只证明定位到所属链；尚未证明上下游完成/u);
  assert.doesNotMatch(
    chain,
    /node\.machineKeys\.includes\(runtimeProcessKey\)/u,
  );
  assert.match(page, /ProcessRuntime completed 不等于业务事实已落账/u);
  assert.match(page, /尚未证明业务事实已落账/u);
  assert.match(
    page,
    /业务单据、岗位协同、流程运行、已生效业务记录和计算结果[\s\S]{0,160}?不会因为流程走完就一起显示为完成/u,
  );
  assert.match(page, /Workflow task done ≠ Fact posted/u);
  assert.match(page, /未提供运行凭证查询|factRuntimeQuery\.label/u);
  assert.match(page, /真实流程请先用任务信息定位/u);
  assert.match(
    page,
    /使用任务名称、任务编号或来源单号定位，[\s\S]{0,40}?无需数据库[\s\S]{0,20}?ID/u,
  );
  assert.doesNotMatch(
    page,
    /(?:get|list|search)(?:Fact|Ledger)(?:Proof|Voucher|Receipt)/u,
  );
});

test("dev flow state observatory: evidence is collapsed and no risky business write is imported", () => {
  const page = read(
    "web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx",
  );
  const helper = read("web/src/dev-workbench/pages/devFlowStateTaskLookup.mjs");
  const businessChains = read(
    "web/src/dev-workbench/config/devBusinessChainCatalog.mjs",
  );
  const facts = read("web/src/dev-workbench/config/devFactLedgerCatalog.mjs");

  assert.match(page, /function EvidenceDisclosure/u);
  assert.match(page, /<details[^>]*data-evidence-disclosure/u);
  const evidenceStart = page.indexOf("function EvidenceDisclosure");
  const evidenceEnd = page.indexOf(
    "\nfunction GuidanceDisclosure",
    evidenceStart,
  );
  assert(evidenceStart >= 0 && evidenceEnd > evidenceStart);
  const evidenceDisclosure = page.slice(evidenceStart, evidenceEnd);
  assert.doesNotMatch(evidenceDisclosure, /<details[^>]*\bopen(?:=|\s|>)/u);

  const forbiddenMutationBinding =
    /\b(?:create|update|delete|complete|approve|reject|post|reverse|cancel)(?:WorkflowTask|Fact|Ledger|Payment|Inventory|Shipment|Process)\b/u;
  const directWriteRequest = /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/iu;
  const directDatabase =
    /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_][\w.]*\s+SET|DELETE\s+FROM)\b/iu;
  for (const [name, source] of [
    ["page", page],
    ["task helper", helper],
    ["business chain catalog", businessChains],
    ["fact catalog", facts],
  ]) {
    for (const importMatch of source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gu,
    )) {
      assert.doesNotMatch(
        importMatch[1],
        forbiddenMutationBinding,
        `${name} imports a risky write binding`,
      );
    }
    assert.doesNotMatch(source, directWriteRequest, `${name} writes over HTTP`);
    assert.doesNotMatch(source, directDatabase, `${name} contains direct SQL`);
  }
});

test("dev flow state observatory: responsive CSS uses a mobile step list and removes nested vertical scrolling", () => {
  const css = read(
    "web/src/dev-workbench/styles/dev-flow-state-observatory.css",
  );
  assert.match(css, /\[data-erp-theme='dark'\] \.erp-dev-flow-state-page/u);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.erp-dev-flow-overview-graph,[\s\S]*?\.erp-dev-flow-chain-graph,[\s\S]*?display: none/u,
  );
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.erp-dev-flow-overview-lanes,[\s\S]*?grid-template-columns: 1fr/u,
  );
  assert.match(
    css,
    /\.erp-dev-flow-overview-lanes button[\s\S]*?min-height: 108px/u,
  );
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.erp-dev-flow-chain-steps[\s\S]*?grid-template-columns: 1fr/u,
  );
  assert.match(
    css,
    /@media \(max-width: 640px\)[\s\S]*?\.erp-dev-flow-nav \.erp-dev-task-nav[\s\S]*?grid-template-columns: repeat\(2/u,
  );
  const detailStart = css.indexOf(".erp-dev-flow-node-detail {");
  const detailEnd = css.indexOf("\n}", detailStart);
  assert(detailStart >= 0 && detailEnd > detailStart);
  const detail = css.slice(detailStart, detailEnd);
  assert.doesNotMatch(detail, /overflow-y:\s*(?:auto|scroll)/u);
  assert.doesNotMatch(detail, /max-height/u);
});
