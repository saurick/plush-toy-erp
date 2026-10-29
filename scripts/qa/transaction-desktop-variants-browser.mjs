#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { financeFlow, qualityFlow, inventoryFlow } from './transaction-real-backend-browser.mjs';
import { financeReportingEvidenceFlow } from './transaction-finance-reporting-browser.mjs';
import { shellDispositionsThroughBrowser } from './transaction-shell-dispositions-browser.mjs';
import { productionShipmentFlow } from './transaction-production-shipment-browser.mjs';
import { createTransactionClient, prepareTransactionFixture, prepareTransactionProductionSource } from './transaction-real-backend-fixture.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');

export async function runDesktopVariantsBrowser(input) {
  const options = { ...input, mobile: false, fourK: true, outputDir: path.join(input.outputDir, 'desktop-variants') };
  await fs.mkdir(options.outputDir, { recursive: true, mode: 0o700 });
  const selectedCase = input.desktopCase || 'all';
  assert.ok(['all', 'advance', 'outsourcing', 'shell'].includes(selectedCase));
  const runCase = value => selectedCase === 'all' || selectedCase === value;
  const client = createTransactionClient(options);
  const report = { status: 'running', simulatedOnly: true, mobileOutsourcingIncluded: runCase('outsourcing'), flows: [], browserRPC: [], pageErrors: [] };
  let browser;
  try {
    report.identity = await client.verify();
    const fixture = await prepareTransactionFixture(client, options);
    report.frontendIdentity = await client.verifyFrontend();
    browser = await chromium.launch({ headless: true });
    if (runCase('advance')) {
    const source = await prepareTransactionProductionSource(client, options, fixture);
    for (const scenario of [
      { key: 'desktop_purchase_advance', suffix: 'PURCHASE-ADV', sourceType: 'purchase_order', source: fixture.order, amount: 20 },
      { key: 'desktop_outsourcing_advance', suffix: 'OUTSOURCE-ADV', sourceType: 'outsourcing_order', source: source.contract, amount: 1 },
    ]) {
      await financeFlow(browser, options, client, fixture, report, 'DISBURSEMENT', { ...scenario, kind: 'ADVANCE' });
      const persisted = client.query(`SELECT json_build_object('sourceType',source_type,'sourceID',source_id,'direction',direction,'kind',kind,'amount',amount,'status',status) FROM finance_payments WHERE payment_no='${fixture.prefix}-${scenario.suffix}'`);
      assert.deepEqual(persisted, { sourceType: scenario.sourceType, sourceID: scenario.source.id, direction: 'DISBURSEMENT', kind: 'ADVANCE', amount: scenario.amount, status: 'REVERSED' });
      Object.assign(report.flows.at(-1), { sourceType: scenario.sourceType, sourceID: scenario.source.id, exactAmount: scenario.amount, sourcePersisted: true });
    }
    await financeReportingEvidenceFlow(browser, options, client, fixture, report);
    }
    if (runCase('outsourcing') || runCase('shell')) {
    await qualityFlow(browser, options, client, fixture, report);
    if (selectedCase === 'outsourcing') {
      // This scoped scenario needs received material, not the independent inventory-count journey.
      const { purchase_receipt: received } = await client.rpc('warehouse', 'purchase', 'post_purchase_receipt', { id: fixture.receipt.id });
      assert.equal(received.status, 'POSTED');
      report.materialFixture = { receiptID: received.id, posted: true };
    } else await inventoryFlow(browser, options, client, fixture, report);
    if (runCase('outsourcing')) {
      const desktop = await productionShipmentFlow(browser, options, client, fixture, report, { key: 'desktop_wip_outsourcing', outsourcingOperations: ['SEWING', 'HANDWORK'], dropReturnResponse: true, skipShipment: true });
      await productionShipmentFlow(browser, { ...options, mobile: true, fourK: false }, client, fixture, report, { key: 'wip_outsourcing', conflictingSalesOrderNo: desktop.source.salesOrder.order_no, outsourcingOperations: ['SEWING', 'HANDWORK'], dropReturnResponse: true, skipShipment: true });
    }
    if (runCase('shell')) await productionShipmentFlow(browser, options, client, fixture, report, { key: 'desktop_shell', outsourcingOperations: ['SEWING'], onShellRejected: shellDispositionsThroughBrowser });
    }
    const expected = [
      ...(runCase('advance') ? ['desktop_purchase_advance', 'desktop_outsourcing_advance', 'desktop_finance_reporting_evidence'] : []),
      ...(runCase('outsourcing') || runCase('shell') ? ['quality', ...(selectedCase === 'outsourcing' ? [] : ['inventory'])] : []),
      ...(runCase('outsourcing') ? ['desktop_wip_outsourcing', 'mobile_wip_outsourcing'] : []),
      ...(runCase('shell') ? ['desktop_shell_dispositions'] : []),
    ];
    assert.deepEqual(report.flows.map(r => r.key), expected);
    assert.ok(report.flows.every(r => r.passed));
    if (runCase('advance')) assert.ok(report.flows.filter(r => r.key.endsWith('_advance')).every(r => r.sourcePersisted));
    if (runCase('outsourcing')) for (const surface of ['desktop', 'mobile']) {
      const flow = report.flows.find(r => r.key === `${surface}_wip_outsourcing`);
      assert.deepEqual(flow.outsourcingOperations, ['SEWING', 'HANDWORK']);
      assert.equal(flow.planningSurface, 'desktop');
      if (surface === 'mobile') assert.equal(flow.mobilePlanWriteUnavailable, true);
      assert.deepEqual(flow.outsourcingEntryChecks.map(({ operation, surface: actual, passed }) => ({ operation, surface: actual, passed })),
        ['SEWING', 'HANDWORK'].map(operation => ({ operation, surface, passed: true })));
    }
    if (runCase('shell')) assert.deepEqual(report.flows.find(r => r.key === 'desktop_shell_dispositions').decisions.map(r => r.type), ['WIP_CONCESSION', 'SCRAP', 'REWORK_ORIGINAL', 'REWORK_SWITCH', 'REMAKE']);
    if (runCase('shell')) {
      assert.equal(report.expectedNegativeReads.length, 1);
      assert.equal(report.expectedNegativeReads[0].expectedErrors.length, 1);
      assert.equal(report.expectedNegativeReads[0].recovered, true);
    }
    assert.deepEqual(report.pageErrors, []);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(options.outputDir, 'failure.png'), fullPage: true }).catch(() => {});
      report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 16000);
    }
    throw error;
  } finally {
    await browser?.close();
    report.fixtureRPC = client.calls;
    await fs.writeFile(path.join(options.outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  assert.deepEqual(args.slice(0, 1), ['--environment']);
  assert.equal(args.length, 2);
  const report = await runDesktopVariantsBrowser(JSON.parse(await fs.readFile(args[1], 'utf8')));
  process.stdout.write(`desktop variants: ${report.status}, ${report.flows.length} flows\n`);
}
