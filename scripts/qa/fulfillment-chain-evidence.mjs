import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertFulfillmentChainEvidence, FULFILLMENT_STEPS } from './transaction-fulfillment-chains.mjs';
import { verifyTransactionRequestLogs } from './lib/transaction-request-logs.mjs';
import { verifyGoTestJson } from './verify-go-test-json.mjs';
import { describeDevBusinessChainResponsibility } from '../../web/src/dev-workbench/config/devBusinessChainProjection.mjs';
import { aggregateChainAuditStatus, CHAIN_AUDIT_STATES, validateBusinessChainReport } from '../../web/src/dev-workbench/config/devBusinessChainAudit.mjs';
import { validateBusinessChainDefinitionSnapshot } from './manual-acceptance-business-chain-contract.mjs';
import { FULFILLMENT_BRANCH_CASES, FULFILLMENT_REMAINING_STEPS } from './transaction-fulfillment-branches.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const caseLabel = key => FULFILLMENT_BRANCH_CASES[key]?.label || (key === 'order_to_settlement' ? '订单到结清' : '质量异常返工到结清');
export const FULFILLMENT_LIMITS = Object.freeze([
  '两张独立合成订单，各 2 件；一条裁片委外、车缝、手工、包装路线；CNY、单客户、单次足量交付。',
  '返工覆盖本厂皮套不合格后整批原岗位返工、重新检验及后续交付；换厂、重做、报废、让步接收未执行。',
  '业务写入经过真实岗位 API；桌面浏览器核对终态与来源，不代表逐按钮完整操作验收。',
  '未覆盖部分交付、预付款、退款、退货、冲正、开票、多币种、并发容量、手机、打印及真实设备。',
  '只证明隔离源码快照与本机一次性环境；不代表共享开发库、目标部署、真实客户数据或客户验收。',
]);
const BRANCH_LIMITS = Object.freeze([
  '同一隔离批次复跑两条足量交付结清主路径，并补齐库存预留、审批拒绝、质检纠正、普通委外回货、出货撤销、财务纠正、超领和报废交接。',
  '每个交接均有实际案例和来源读回；未穷举权限、并发、币种、数量、工艺和处置方式的所有组合，换厂返工与重做未执行。',
  '补充分支中的成品期初库存经正式调整、独立审批与过账构造，只用于预留、出货和财务场景，不代替生产完工证据。',
  '退款、部分核销、冲正和反向红冲分别保留现金、核销与未结余额；拒绝、取消和报废按各自预期终态核对，不要求全部场景结清。',
  '业务动作经过岗位 API，桌面页面读取来源与结果；未逐按钮完成所有动作，也未验证手机、打印、开票、并发容量、目标部署或客户验收。',
]);
function branchSummary(flow) {
  const r = flow.readback;
  switch (flow.key) {
    case 'stock_reservation': return `订单 #${r.salesOrderID} 显式预留 2 件，可用量 10→8；释放后恢复 10，库存流水不增加。`;
    case 'source_rejections': return `销售单 #${r.sales.id}、采购单 #${r.purchase.id} 审批拒绝后取消；任务均 rejected，未生成事实。`;
    case 'purchase_correction': return `人工采购 #${r.orderID} 审批通过；原检验 #${r.oldInspectionID} 保留，新检验 #${r.newInspectionID} 独立合格；收货 #${r.receiptID} 实际入库 10，一笔流水。`;
    case 'outsourcing_return': return `合同 #${r.contractID} 发料、回货 #${r.returnID} 过账 2；质检冻结后恢复可用，仍只有一笔入库流水；应付草稿 #${r.payableID} 为 2 元。`;
    case 'shipment_corrections': return `出货单 #${r.rejectedShipmentID} 财务拒绝后保持草稿与库存 10；另一已出货单 #${r.cancelledShipmentID} 撤销后库存 0→10，重放不新增流水。`;
    case 'finance_adjustments': return `订单首款 20、独立退款 5 后可用 15 元；应收 #${r.factID} 为 35 元，部分核销后未结 20，撤销抵扣及整笔冲正分别恢复 35；部分红冲后未结 30、再红冲结清，反向红冲后恢复 30；原始红冲保留。`;
    case 'production_over_issue': return `生产单 #${r.orderID} 原计划与已领均为 2；批准超领额度 1 时不生成领料事实，后续领料 #${r.extraIssueID} 实际过账 1，累计已领 3、剩余 0。`;
    case 'production_scrap': return `生产异常拒绝 #${r.rejectedDecisionID}、取消 #${r.cancelledDecisionID} 均不执行；已批准报废 #${r.executedDecisionID} 终止原批 #${r.batchID}，不创建子批或成品入库，原不合格检验完整保留。`;
    default: throw new Error('unknown fulfillment branch');
  }
}

export function buildFulfillmentChainReport({ lifecycle, browser, postgresJSON, observabilityJSON, requestJSON, browserJSON }) {
  assert.equal(lifecycle.status, 'passed');
  assert.equal(lifecycle.scope, browser.includeBranches ? 'fulfillment-branches' : 'fulfillment-chains');
  assert.equal(lifecycle.cleanup?.passed, true, 'cleanup is required before publishing successful evidence');
  assert.match(lifecycle.source?.commit, /^[a-f0-9]{40}$/u);
  assert.match(lifecycle.source?.fingerprint, /^[a-f0-9]{64}$/u);
  assertFulfillmentChainEvidence(browser);
  const full = Boolean(browser.includeBranches);
  const allFlows = [...browser.flows, ...(browser.branchFlows || [])];
  const limits = full ? BRANCH_LIMITS : FULFILLMENT_LIMITS;
  assert.equal(JSON.stringify(JSON.parse(browserJSON)), JSON.stringify(browser), 'browser artifact and parsed evidence differ');
  for (const [key, bytes] of [['browserDigest', browserJSON], ['postgresDigest', postgresJSON], ['observabilityDigest', observabilityJSON], ['requestDigest', requestJSON]])
    assert.equal(sha256(bytes), lifecycle.fulfillmentEvidence?.[key], `unbound ${key}`);
  assert.deepEqual(verifyTransactionRequestLogs(browser, requestJSON), lifecycle.requestLogs);
  for (const [text, expected, prefixes] of [
    [postgresJSON, lifecycle.postgres, ['TestInventoryPostgres', 'TestQualityInspectionPostgres', 'TestOperationalFactRepoFinance']],
    [observabilityJSON, lifecycle.observability, ['TestRequestLogging', 'TestRequestIDFilter', 'TestSafeServerTracing', 'TestBusinessTrace', 'TestPostgresSQL', 'TestNormalizeRuntimeAuditEventCreate']],
  ]) {
    const counts = verifyGoTestJson(text, prefixes);
    assert.equal(counts.ok, true); assert.equal(counts.skip, 0); assert.ok(counts.pass > 0);
    assert.deepEqual(counts, expected);
  }
  const chains = Object.keys(FULFILLMENT_STEPS).map(key => {
    const frozen = browser.definitionSnapshot.chains.find(row => row.key === key);
    const nodeLabel = key => frozen.nodes.find(row => row.key === key)?.label || key;
    const steps = frozen.steps.map((step, index) => {
      const proofs = browser.steps.filter(row => row.chainKey === key && row.key === step.key);
      const status = proofs.length ? 'passed' : 'not_run';
      return { key: step.key, number: index + 1, label: step.label, fromLabel: nodeLabel(step.fromNodeKey), toLabel: nodeLabel(step.toNodeKey),
        responsibleRole: describeDevBusinessChainResponsibility(step.responsibility),
        preconditions: [step.condition, ...step.preconditionStateRefs.map(row => `${row.machineKey}：${row.stateKey}`)].filter(Boolean),
        actions: [step.label], results: step.resultStateRefs.map(row => `${row.machineKey}：${row.stateKey}`), facts: [step.factBoundary],
        status, statusLabel: CHAIN_AUDIT_STATES[status].label,
        level: proofs.length ? '真实岗位 API、PostgreSQL 因果读回及桌面终态核对' : '本批次未执行',
        observed: proofs.length ? proofs.map(row => `${caseLabel(row.caseKey)}：${row.requestIDs.length} 条请求关联日志；${FULFILLMENT_BRANCH_CASES[row.caseKey] ? '来源、预期状态、数量金额和库存对账见该案例的原始读回。' : JSON.stringify(row.readback)}`).join('；') : '该条件分支未执行；不以同链其他步骤或历史结果替代。',
        evidence: proofs.length ? [{ path: 'report.md', label: '案例、步骤、实测结果与范围' }, { path: 'execution.json', label: '来源 ID、数量、金额与逐请求证据' }] : [],
      };
    });
    const status = aggregateChainAuditStatus(steps);
    return { key, label: frozen.label, summary: key === 'production_exception' ? '原不合格证据保留，返工子批次复检后继续交付和结清。' : '同一订单与其真实来源单据的连续业务验证。',
      status, statusLabel: CHAIN_AUDIT_STATES[status].label, stepCount: steps.length, steps,
      scenarios: frozen.scenarios.map(row => ({ key: row.key, label: row.label || row.kind, result: full ? '本批次覆盖该链已登记交接；只证明所列案例的实际参数、状态与守卫，不扩大为该场景的所有组合。' : '仅本报告列出的两条连续路径与守卫有本轮证据，其余场景未执行。' })),
      evidence: [{ path: 'execution.json', label: '连续案例与实际读回' }, { path: 'report.md', label: '实测报告' }] };
  });
  const allSteps = chains.flatMap(row => row.steps);
  const report = {
    title: full ? '订单结清与条件交接 · 同批全链实测' : '订单到结清、质量异常返工 · 连续业务实测', generatedAt: lifecycle.finishedAt,
    verdict: full ? '68/68 个交接步骤通过：同批复跑订单结清与本厂返工两条主路径，并补齐原未执行的 28 个条件交接；8 个补充案例的拒绝、纠正、退款、余额恢复及报废结果符合预期。' : '2/2 连续案例通过：足量生产与真实出货，应收、材料应付及加工应付全部结清；原岗位返工经复检继续到交付结算。其余条件分支未执行。',
    scope: { sourceCommit: lifecycle.source.commit, customer: 'Product Core · yoyoosun 配置的合成岗位',
      data: `独立 PostgreSQL、存储与运行实例；合成批次 ${browser.runID}`,
      mode: '真实岗位 API + PostgreSQL 只读核验 + 桌面浏览器来源与结果核对', terminal: full ? '两条主路径足量出货并结清；各条件分支达到预期拒绝、纠正、退款、冲正、余额恢复或报废终态' : '每单足量出货 2 件；三笔应收应付 SETTLED，未结与未分配金额均为 0',
      notIncluded: full ? ['所有参数、权限、并发与错误恢复的组合', '换厂返工、重做、让步接收、采购退货与开票', '逐按钮全程办理、手机、打印与真实设备', '多币种、并发容量、目标部署和客户验收'] : ['逐按钮全程浏览器验收、手机、打印与真实设备', '部分交付、首款与预付、退款、退货、冲正与开票', '换厂、重做、报废、让步、多币种与其他工艺路线', '并发容量、共享业务库、目标部署与客户验收'],
      chainCount: chains.length, stepCount: allSteps.length, registeredScenarioCount: chains.reduce((sum, row) => sum + row.scenarios.length, 0) },
    metrics: { stepStates: Object.fromEntries(Object.keys(CHAIN_AUDIT_STATES).map(key => [key, allSteps.filter(row => row.status === key).length])) },
    definitionSnapshot: browser.definitionSnapshot, chains, coverageLimits: [...limits], findings: [],
    evidence: [{ path: 'report.md', label: full ? '主路径与补充交接实测报告' : '两案例实测报告' }, { path: 'execution.json', label: 'API、数据库与浏览器原始读回' },
      { path: 'lifecycle.json', label: '源码快照、环境与资源清理' }, { path: 'requests.log', label: '脱敏请求与 Trace 关联' },
      { path: 'postgres.log', label: '真实 PostgreSQL 回归事件' }, { path: 'observability.log', label: '日志与 Trace 验证事件' },
      ...allFlows.flatMap(flow => flow.browserReadback.map(row => ({ path: row.screenshot, label: `${caseLabel(flow.key)}：${row.key || '来源与结果'}截图` })))],
    createEdit: [], mobileActions: [],
    pages: allFlows.flatMap(flow => flow.browserReadback.map(row => ({ key: `${flow.key}-${row.key || 'readback'}`, title: `${caseLabel(flow.key)} ${row.key || '来源与结果'}`, roleKey: row.role, status: 'passed' }))),
    lineage: browser.flows.map(flow => ({ stage: caseLabel(flow.key), record: flow.orderNo, proof: `来源 ${JSON.stringify(flow.ids)}；订单 ${flow.readback.orderQuantity}，生产 ${flow.readback.completedQuantity}，出货 ${flow.readback.shippedQuantity}；3 笔结清。` })),
    printing: { templates: [] }, pdfValidation: { templates: [] },
  };
  validateBusinessChainReport(report);
  validateBusinessChainDefinitionSnapshot(report.definitionSnapshot, report.chains);
  return report;
}

export function fulfillmentBusinessReport({ lifecycle, browser, report }) {
  const full = Boolean(browser.includeBranches);
  const allFlows = [...browser.flows, ...(browser.branchFlows || [])];
  const lines = [full ? '# 订单结清与条件交接实测报告' : '# 订单到结清、质量异常返工实测报告', '', report.verdict, '',
    `执行时间：${browser.generatedAt} 至 ${lifecycle.finishedAt}。`, '',
    `源码：\`${lifecycle.source.commit}\`；工作区摘要：\`${lifecycle.source.fingerprint}\`；含未提交改动：${lifecycle.source.dirty ? '是' : '否'}。`, '',
    full ? '业务数据仅经正式 API 写入；SQL 只读。两条主路径分别绑定独立订单、SKU、工程需料、采购、批次、生产与出货来源。补充分支按各自前置条件构造；人工采购入库的物料由普通委外、超领和报废案例显式复用并逐次对账，不把共享来源描述为独立物料。基础资料与隔离配置沿用现有准备器。' : '业务数据仅经正式 API 写入；SQL 只读。每案例使用独立订单、SKU、工程需料单、采购单、物料批次、生产单、成品批次和出货单。基础资料与隔离配置通过现有准备器创建；准备器的独立采购草稿不属于案例证据。', '',
    '| 案例 | 来源订单 | 下单 / 生产 / 出货 | 应收 | 材料应付 | 加工应付 | 库存终态 |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const flow of browser.flows) lines.push(`| ${caseLabel(flow.key)} | ${flow.orderNo} (#${flow.ids.salesOrderID}) | ${flow.readback.orderQuantity} / ${flow.readback.completedQuantity} / ${flow.readback.shippedQuantity} 件 | 7.00 元，结清 | 2.50 元，结清 | 2.00 元，结清 | 本批物料与成品均 0；各 2 笔流水 |`);
  lines.push('', '| 交接 | 执行与实测依据 |', '| --- | --- |',
    '| 接单到工程 | 激活同一订单、岗位接单、启用 BOM、工程需料审核生成采购；生产项引用原订单项与 BOM。 |',
    '| 采购到用料 | 对生成采购补齐单价，收货、来料合格、入库，再从该批物料发给同一生产单的裁片委外。质检通过不自动记库存。 |',
    '| 加工到成品 | 裁片委外返回并检验、车缝与皮套检查、手工、成品入库、三道成品检查、包材确认与包装完成。 |',
    '| 成品到出货 | 出货行引用该订单项及本次生产的成品批次；财务放行后真实出货。提前生成应收被拒，库存与财务未被旁路修改。 |',
    '| 出货到结清 | 真实出货生成应收，采购入库生成材料应付，已完成裁片委外生成加工应付；逐笔过账、审批、登记收付款并核销，三笔原始金额全部结清。 |',
    '| 协同与事实 | 收付款任务完成后仍为 APPROVED 且无核销；显式过账才生成核销。重复执行过账不增加核销。 |',
    '| 返工 | 皮套不合格先阻断转序；批准原岗位返工后原批取消、建立带来源和异常编号的返工子批；执行重放无重复批次；子批重新检验合格后继续后续交付结算。原不合格检验完整保留。 |', '',
    '| 案例 | 关键来源 ID（原始读回见 execution.json） |', '| --- | --- |');
  for (const flow of browser.flows) lines.push(`| ${caseLabel(flow.key)} | ${Object.entries(flow.ids).map(([key, id]) => `${key}=#${id}`).join('；')} |`);
  lines.push('', '| 自动门禁 | 实测 |', '| --- | --- |',
    `| PostgreSQL 回归 | ${lifecycle.postgres.pass}/${lifecycle.postgres.run}，跳过 ${lifecycle.postgres.skip}，失败 ${lifecycle.postgres.fail} |`,
    `| 日志与 Trace 合同 | ${lifecycle.observability.pass}/${lifecycle.observability.run}，跳过 ${lifecycle.observability.skip} |`,
    `| 请求与服务端日志关联 | ${lifecycle.requestLogs.matched} 条；成功 ${lifecycle.requestLogs.success}，预期业务拒绝 ${lifecycle.requestLogs.rejected}；无凭据 |`,
    `| 桌面终态 | ${allFlows.reduce((sum, flow) => sum + flow.browserReadback.length, 0)} 个来源页面；截图 3840×2160，视口 1920×1080，DPR 2 |`,
    `| 隔离资源清理 | ${lifecycle.cleanup.passed ? '通过：本轮源码副本、数据库与存储容器、卷和运行进程已清理' : '失败'} |`, '',
    full ? '同一批次已执行这 7 条业务链的 68 个交接；交接通过不代表所有参数、权限及异常组合均已覆盖。' : '业务链完整目录仍保留未执行分支；当前报告仅对 2 个案例涉及的交接给出通过证据。', '',
    ...(full ? BRANCH_LIMITS : FULFILLMENT_LIMITS).map((line, index) => `${index + 1}. ${line}`), '',
    '现有订单、生产、出货、应收和异常页面用于浏览器终态核对；所有截图与读回随 artifact-manifest.json 固定摘要。订单是否关闭属于来源单据生命周期，SETTLED 来自财务事实与核销，不以手工关闭替代结清。', '');
  if (full) {
    lines.push('', '| 补充案例 | 实测结果与来源 |', '| --- | --- |');
    for (const flow of browser.branchFlows) lines.push(`| ${caseLabel(flow.key)} | ${branchSummary(flow)} |`);
    lines.push('', '| 原未执行交接 | 所属案例 | 本批次 |', '| --- | --- | --- |');
    for (const item of FULFILLMENT_REMAINING_STEPS) {
      const chain = browser.definitionSnapshot.chains.find(row => row.key === item.chainKey);
      lines.push(`| ${chain.steps.find(row => row.key === item.key).label} | ${caseLabel(item.caseKey)} | 通过，来源与读回见 execution.json |`);
    }
    lines.push('', '普通委外回货先通过正式回货过账入库，再创建质检草稿，提交检验时冻结批次；合格判定解除冻结且不重复增加库存。原图中把回货过账放在检验通过后的表达已按领域真源同步；历史批次保持原定义并由工作台显示差异。', '');
  }
  return lines.join('\n');
}

export async function publishFulfillmentChainEvidence({ root = path.resolve(import.meta.dirname, '../..'), directory }) {
  const source = await fs.realpath(directory);
  const qa = path.join(await fs.realpath(root), 'output/qa');
  assert.ok(source.startsWith(`${qa}${path.sep}`), 'evidence source must be inside this checkout output/qa');
  const files = new Map();
  for (const file of ['lifecycle.json', 'postgres.jsonl', 'observability.jsonl', 'requests.jsonl']) files.set(file, await fs.readFile(path.join(source, file)));
  const browserJSON = await fs.readFile(path.join(source, 'browser/fulfillment-chains/report.json'));
  const lifecycle = JSON.parse(files.get('lifecycle.json')), browser = JSON.parse(browserJSON);
  const report = buildFulfillmentChainReport({ lifecycle, browser, browserJSON: browserJSON.toString(),
    postgresJSON: files.get('postgres.jsonl').toString(), observabilityJSON: files.get('observability.jsonl').toString(), requestJSON: files.get('requests.jsonl').toString() });
  for (const stem of ['postgres', 'observability', 'requests']) {
    files.set(`${stem}.log`, files.get(`${stem}.jsonl`)); files.delete(`${stem}.jsonl`);
  }
  files.set('execution.json', browserJSON);
  files.set('report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  files.set('report.md', Buffer.from(fulfillmentBusinessReport({ lifecycle, browser, report })));
  for (const flow of [...browser.flows, ...(browser.branchFlows || [])]) for (const proof of flow.browserReadback) files.set(proof.screenshot, await fs.readFile(path.join(source, 'browser/fulfillment-chains', proof.screenshot)));
  const batch = `${browser.includeBranches ? 'fulfillment-branches-e2e' : 'fulfillment-e2e'}-${browser.runID}`;
  const parent = path.join(qa, 'business-chain-audit'), target = path.join(parent, batch);
  await fs.mkdir(parent, { recursive: true });
  await assert.rejects(fs.stat(target), { code: 'ENOENT' }, 'a published batch is immutable');
  const staging = await fs.mkdtemp(path.join(parent, '.fulfillment-publishing-'));
  try {
    const manifest = [];
    for (const [file, bytes] of files) {
      await fs.writeFile(path.join(staging, file), bytes, { mode: 0o600 });
      manifest.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
    }
    await fs.writeFile(path.join(staging, 'artifact-manifest.json'), JSON.stringify({ files: manifest }, null, 2) + '\n');
    await fs.rename(staging, target);
  } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
  return { batch, directory: target, verdict: report.verdict };
}
