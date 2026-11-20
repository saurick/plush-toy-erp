import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { login, closePage, settleRPCPage, openMobileTaskCard } from './transaction-browser-ui.mjs';
import { BUSINESS_SEARCH_SCOPES } from '../../web/src/erp/utils/businessSearchScopes.mjs';
import { BUSINESS_ROUTE_PATHS } from '../../web/src/erp/utils/masterDataOrderView.mjs';
import { WorkflowTaskStatus } from '../../web/src/common/consts/statuses.generated.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { expect } = require('playwright/test');

const cases = [
  { key: 'sales-superseded', cancellations: [['list_sales_orders', 'scope_superseded'], ['get_sales_order', 'scope_superseded']] },
  { key: 'sales-document-reload', cancellations: [['list_sales_orders', 'document_navigation']] },
  { key: 'sales-unexplained-abort-retry', failure: 'list_sales_orders' },
  { key: 'mobile-quality-disposed-390', cancellations: [['explain_action_access', 'scope_disposed']] },
  { key: 'mobile-quality-unexplained-abort-retry-390', failure: 'explain_action_access' },
  { key: 'mobile-quality-disposed-320', cancellations: [['explain_action_access', 'scope_disposed']] },
  { key: 'mobile-quality-unexplained-abort-retry-320', failure: 'explain_action_access' },
];
export const REQUEST_CANCELLATION_CASE_KEYS = Object.freeze(cases.map(entry => entry.key));

export function assertRequestCancellationEvidence(evidence) {
  assert.deepEqual(evidence.cases.map(entry => entry.key), REQUEST_CANCELLATION_CASE_KEYS);
  assert.equal(evidence.domainDataUnchanged, true);
  for (const [index, entry] of evidence.cases.entries()) {
    const specification = cases[index];
    assert.equal(entry.passed, true);
    assert.ok(entry.screenshots.length > 0);
    assert.ok(entry.networkPages.length > 0);
    assert.ok(entry.browserRPC.length > 0, 'each scenario must execute real browser RPC');
    assert.deepEqual(entry.browserRPC.filter(call => call.code !== 0 || call.http !== 200), []);
    assert.equal(entry.viewport.overflow, 0);
    assert.equal(entry.expectedFailure, specification.failure);
    const normal = entry.networkPages.flatMap(page => page.cancellations);
    if (specification.failure) {
      assert.equal(entry.pageErrors.length, 1);
      assert.equal(entry.pageErrors[0].method, entry.expectedFailure);
      assert.equal(entry.pageErrors[0].message, 'Unexpected RPC transport failure');
      assert.equal(entry.pageErrors[0].failure.errorText, 'net::ERR_ABORTED');
      assert.equal(entry.pageErrors[0].failure.canceled, true);
      assert.equal(entry.pageErrors[0].cancellationClassification, 'cancellation_without_lifecycle_evidence');
      assert.equal(entry.errorVisible, true);
      assert.equal(entry.recovered, true);
      assert.equal(normal.filter(call => call.requestId === entry.pageErrors[0].failure.requestID).length, 0);
    } else {
      assert.deepEqual(entry.pageErrors, []);
      assert.deepEqual(entry.expectedCancellations, specification.cancellations);
      for (const [method, category] of specification.cancellations) {
        assert.ok(normal.some(call => call.method === method && call.category === category), `${entry.key}: missing ${method}/${category}`);
      }
    }
  }
}

// Hold an actual successful backend response; never substitute a fabricated business result.
async function holdReads(page, domain, methods, predicate = () => true) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const held = [];
  const seen = new Set();
  await page.route(`**/rpc/${domain}`, async route => {
    const call = route.request().postDataJSON();
    if (!methods.includes(call.method) || seen.has(call.method) || !predicate(call)) return route.continue();
    seen.add(call.method);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).result.code, 0);
    const item = { method: call.method, rpcID: String(call.id), serverRequestID: response.headers()['x-request-id'] };
    held.push(item);
    await gate;
    await route.fulfill({ response });
  });
  return { held, release };
}

async function abortOneRead(page, domain, method, predicate = () => true) {
  let injected = 0;
  await page.route(`**/rpc/${domain}`, async route => {
    const call = route.request().postDataJSON();
    if (injected || call.method !== method || !predicate(call)) return route.continue();
    injected++;
    await route.abort('aborted');
  });
  return () => assert.equal(injected, 1, 'the negative test must cause exactly one real browser transport failure');
}

export async function runRequestCancellationBrowser(browser, options, client, fixture, report) {
  const evidence = report.requestCancellation = { cases: [], domainDataUnchanged: false };
  const snapshot = () => client.query(`SELECT json_build_object('sales',(SELECT row_to_json(s) FROM sales_orders s WHERE id=${fixture.salesOrder.id}),'receipt',(SELECT row_to_json(r) FROM purchase_receipts r WHERE id=${fixture.receipt.id}),'inspection',(SELECT row_to_json(q) FROM quality_inspections q WHERE id=${fixture.inspection.id}),'inventory',(SELECT count(*) FROM inventory_txns),'funds',(SELECT count(*) FROM finance_payments))`);
  const before = snapshot();
  const salesURL = new URL(BUSINESS_ROUTE_PATHS.salesOrders, options.baseURL);
  const row = page => page.locator(`.ant-table-row[data-row-key="${fixture.salesOrder.id}"]`);
  const saveScreen = async (page, entry, suffix) => {
    const file = `${entry.key}-${suffix}.png`;
    await page.screenshot({ path: path.join(options.outputDir, file), fullPage: true });
    entry.screenshots.push(file);
    entry.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth - innerWidth }));
    assert.equal(entry.viewport.overflow, 0);
  };
  const inSession = async (key, role, mobile, action, width = 390) => {
    const entry = { key, passed: false, screenshots: [], browserRPC: [], pageErrors: [], mobileTasks: [] };
    evidence.cases.push(entry);
    const session = await login(browser, { ...options, mobile, fourK: !mobile }, role, entry);
    try {
      if (mobile) await session.page.setViewportSize({ width, height: 844 });
      await action(session.page, entry);
    } catch (error) {
      entry.error = error.stack;
      await session.page.screenshot({ path: path.join(options.outputDir, `${key}-failure.png`), fullPage: true });
      throw error;
    } finally {
      try { await closePage(session.page, session.context); }
      finally { if (browser.contexts().includes(session.context)) await session.context.close(); }
      report.browserRPC.push(...entry.browserRPC);
    }
    entry.passed = true;
  };
  await inSession('sales-superseded', 'sales', false, async (page, entry) => {
    const hold = await holdReads(page, 'sales_order', ['list_sales_orders', 'get_sales_order']);
    try {
      const url = new URL(salesURL);
      url.searchParams.set('sales_order_id', fixture.salesOrder.id);
      await page.goto(url.href);
      await expect.poll(() => hold.held.length).toBe(2);
      const search = page.getByPlaceholder(BUSINESS_SEARCH_SCOPES.sales.placeholder, { exact: true });
      await search.fill(fixture.salesOrder.order_no);
      await search.press('Enter');
      await expect.poll(() => page.rpcNetwork.history.filter(call => call.event === 'scope-release' && ['list_sales_orders', 'get_sales_order'].includes(call.method) && call.requestState === 'pending').length).toBeGreaterThanOrEqual(2);
    } finally { hold.release(); }
    await settleRPCPage(page);
    await expect(row(page)).toBeVisible();
    entry.held = hold.held;
    entry.expectedCancellations = [['list_sales_orders', 'scope_superseded'], ['get_sales_order', 'scope_superseded']];
    await saveScreen(page, entry, 'latest-result');
  });
  await inSession('sales-document-reload', 'sales', false, async (page, entry) => {
    const hold = await holdReads(page, 'sales_order', ['list_sales_orders']);
    try {
      await page.goto(salesURL.href);
      await expect.poll(() => hold.held.length).toBe(1);
      await page.reload();
    } finally { hold.release(); }
    await settleRPCPage(page);
    await expect(row(page)).toBeVisible();
    entry.held = hold.held;
    entry.expectedCancellations = [['list_sales_orders', 'document_navigation']];
    await saveScreen(page, entry, 'new-document');
  });
  await inSession('sales-unexplained-abort-retry', 'sales', false, async (page, entry) => {
    const assertInjected = await abortOneRead(page, 'sales_order', 'list_sales_orders');
    await page.goto(salesURL.href);
    const error = page.locator('.ant-message-error').first();
    await expect(error).toBeVisible();
    await expect(error).toContainText(/网络|连接|加载销售订单/);
    entry.errorVisible = true;
    entry.expectedFailure = 'list_sales_orders';
    await saveScreen(page, entry, 'failure-visible');
    await settleRPCPage(page);
    const search = page.getByPlaceholder(BUSINESS_SEARCH_SCOPES.sales.placeholder, { exact: true });
    await search.fill(fixture.salesOrder.order_no);
    await search.press('Enter');
    await settleRPCPage(page);
    await expect(row(page)).toBeVisible();
    entry.recovered = true;
    assertInjected();
    await saveScreen(page, entry, 'retry-recovered');
  });
  const { tasks } = await client.rpc('quality', 'workflow', 'list_tasks', { source_type: 'quality_inspection', source_id: fixture.inspection.id, limit: 100 });
  const task = tasks.find(item => item.owner_role_key === 'quality' && item.task_status_key === WorkflowTaskStatus.READY);
  assert.ok(task, 'a fresh pending quality task is required; zero task execution is not a pass');
  for (const width of [390, 320]) {
    await inSession(`mobile-quality-disposed-${width}`, 'quality', true, async (page, entry) => {
      const hold = await holdReads(page, 'workflow', ['explain_action_access'], call => call.params.task_id === task.id);
      try {
        await openMobileTaskCard(page, task.id);
        await expect.poll(() => hold.held.length).toBe(1);
        await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '返回任务列表', exact: true }).first().click();
        await expect(page.getByTestId('mobile-role-task-list')).toBeVisible();
      } finally { hold.release(); }
      await settleRPCPage(page);
      entry.held = hold.held;
      entry.expectedCancellations = [['explain_action_access', 'scope_disposed']];
      await saveScreen(page, entry, 'returned');
    }, width);
    await inSession(`mobile-quality-unexplained-abort-retry-${width}`, 'quality', true, async (page, entry) => {
      const assertInjected = await abortOneRead(page, 'workflow', 'explain_action_access', call => call.params.task_id === task.id);
      await openMobileTaskCard(page, task.id);
      const screen = page.getByTestId('mobile-task-detail-screen');
      await expect(screen.getByText('暂时无法确认处理权限，请点击下方重试。', { exact: true })).toBeVisible();
      await expect(screen.locator('.mobile-role-action-bar').getByRole('button', { name: '任务办理', exact: true })).toHaveCount(0);
      const retry = screen.getByRole('button', { name: '重新确认', exact: true });
      await expect(retry).toBeEnabled();
      entry.errorVisible = true;
      entry.expectedFailure = 'explain_action_access';
      await saveScreen(page, entry, 'failure-visible');
      await settleRPCPage(page);
      await retry.click();
      await settleRPCPage(page);
      await expect(screen.locator('.mobile-role-action-bar').getByRole('button', { name: '任务办理', exact: true })).toBeEnabled();
      entry.recovered = true;
      assertInjected();
      await saveScreen(page, entry, 'retry-recovered');
      await screen.getByRole('button', { name: '返回任务列表', exact: true }).first().click();
      await settleRPCPage(page);
    }, width);
  }
  assert.deepEqual(snapshot(), before, 'read cancellation and recovery must not mutate source documents or facts');
  evidence.domainDataUnchanged = true;
  assertRequestCancellationEvidence(evidence);
}
