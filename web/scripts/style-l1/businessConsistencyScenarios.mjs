import { assertContractPaperSource } from './contractPaperSourceAssertions.mjs'
import {
  businessRuleTests,
  businessTestKey,
} from '../../../scripts/qa/lib/business-rule-catalog.mjs'
import {
  BUSINESS_CONSISTENCY_SCHEMA,
  businessConsistencyFastTests,
} from '../../../scripts/qa/lib/business-consistency-evidence.mjs'
import { buildPrintWorkspaceDraftStorageKey } from '../../src/erp/utils/printWorkspace.js'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from '../../src/erp/utils/purchaseOrderPrintDraft.mjs'
import { buildMaterialPurchaseContractBusinessDraft } from '../../src/erp/utils/materialPurchaseContractEditor.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../../src/erp/data/processingContractTemplate.mjs'

export function createBusinessConsistencyScenarios({
  assert,
  path,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  return [
    {
      name: 'dev-business-consistency-evidence',
      path: '/__dev/testing?view=coverage&coverage=rules&ruleCategory=consistency',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) =>
          route.fulfill({
            json: {
              status: 'current',
              report: {
                schemaVersion: 'plush-test-coverage-report/v1',
                generatedAt: '2026-10-23T00:00:00Z',
                repository: {
                  commit: 'a'.repeat(40),
                  dirty: true,
                  fingerprint: 'b'.repeat(64),
                },
                codeCoverage: {},
                businessCoverage: { domains: [] },
                gates: [],
                acceptance: {},
                businessConsistency: {
                  schemaVersion: BUSINESS_CONSISTENCY_SCHEMA,
                  status: 'passed',
                  current: true,
                  tests: businessConsistencyFastTests().map((entry) => ({
                    id: businessTestKey(entry),
                    status: 'passed',
                    counts: { executed: 1, passed: 1, failed: 0, skipped: 0 },
                  })),
                },
              },
            },
          })
        )
        await page.route(
          '**/__dev/api/qa/quality-gates/integration-evidence',
          (route) =>
            route.fulfill({
              json: {
                kind: 'plush.integration-evidence',
                current: false,
                scenarios: [],
                run: null,
                ruleTests: businessRuleTests('postgres').map((entry) => ({
                  id: businessTestKey(entry),
                  status: 'missing',
                })),
              },
            })
        )
      },
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '关键规则与发布门禁',
          exact: true,
        })
        await panel.getByText('单价、金额精度与缺值', { exact: true }).waitFor()
        await panel
          .getByRole('button', { name: '运行业务数据一致性专项', exact: true })
          .waitFor()
        const money = panel
          .getByRole('row')
          .filter({ hasText: '单价、金额精度与缺值' })
        await money.getByText('用例通过', { exact: true }).waitFor()
        const allocation = panel
          .getByRole('row')
          .filter({ hasText: '分批税费、应收应付与尾差' })
        await allocation.getByText('未验证', { exact: true }).waitFor()
        await money.getByRole('button').click()
        const details = panel.getByRole('table', {
          name: '单价、金额精度与缺值测试对应关系',
          exact: true,
        })
        await details.getByText('前端数据与打印', { exact: true }).first().waitFor()
        assert.equal(
          await details.getByText('前端数据与打印', { exact: true }).count(),
          3
        )
        await assertNoHorizontalOverflow(page, '业务数据一致性工作台')
        await page.screenshot({
          path: path.join(outputDir, 'business-consistency-workbench-4k.png'),
        })
      },
    },
    ...['material-purchase-contract', 'processing-contract'].map(
      (templateKey) => {
        const stateID = `consistency-${templateKey}`
        const material = templateKey === 'material-purchase-contract'
        const currency = material ? 'USD' : 'HKD'
        const draft = material
          ? buildMaterialPurchaseContractBusinessDraft(
              buildMaterialPurchaseContractDraftFromPurchaseOrder(
                {
                  purchase_order_no: 'PO-CONSISTENCY',
                  currency,
                  supplier_snapshot: { name: '模拟供应方' },
                },
                [
                  {
                    material_name_snapshot: '材料冻结名称',
                    material_spec_snapshot: '规格冻结值',
                    supplier_item_no_snapshot: 'SUP-001',
                    unit_name_snapshot: '米',
                    purchased_quantity: '2',
                    unit_price: '1.25',
                  },
                ]
              )
            )
          : buildProcessingContractDraftFromOutsourcingOrder(
              {
                outsourcing_order_no: 'OUT-CONSISTENCY',
                currency,
                supplier_snapshot: { name: '模拟加工方' },
              },
              [
                {
                  subject_type: 'PRODUCT',
                  product_name_snapshot: '模拟产品',
                  processing_item: '缝制',
                  outsourcing_quantity: '2',
                  unit_price: '1.25',
                  unit_name_snapshot: '件',
                },
              ]
            )
        return {
          name: `business-consistency-print-${material ? 'purchase' : 'processing'}`,
          path: `/erp/print-workspace/${templateKey}?source=business&customer_key=product-core&config_revision=style-l1&state=${stateID}`,
          auth: 'admin',
          viewport: { width: 1920, height: 1080 },
          deviceScaleFactor: 2,
          beforeNavigate: async (page) => {
            const storageKey = buildPrintWorkspaceDraftStorageKey(
              templateKey,
              stateID,
              {
                customerKey: 'product-core',
                accountKey: '1',
                configRevision: 'style-l1',
              }
            )
            await page.addInitScript(
              (initial) => {
                window.name = `__plush_erp_print_initial_draft__:${JSON.stringify(initial)}`
              },
              { version: 1, templateKey, stateID, storageKey, draft }
            )
          },
          verify: async (page) => {
            const paper = page
              .locator(
                material
                  ? '.erp-material-contract-paper'
                  : '.erp-processing-contract-paper'
              )
              .first()
            await paper
              .getByText(material ? 'PO-CONSISTENCY' : 'OUT-CONSISTENCY', {
                exact: true,
              })
              .first()
              .waitFor()
            assert.equal(await paper.getByText('币种：', { exact: true }).count(), 0)
            assert.equal(await paper.getByText(currency, { exact: true }).count(), 0)
            if (material)
              { for (const text of ['材料冻结名称', '规格冻结值', 'SUP-001'])
                { await paper.getByText(text, { exact: true }).waitFor() } }
            await page.evaluate(() => document.fonts.ready)
            await assertContractPaperSource(page, {
              material,
              currency,
              storageKey: buildPrintWorkspaceDraftStorageKey(templateKey, stateID, {
                customerKey: 'product-core', accountKey: '1', configRevision: 'style-l1',
              }),
            })
            await page.screenshot({
              path: path.join(outputDir, `${stateID}-4k.png`),
            })
            await page.emulateMedia({ media: 'print' })
            await page.pdf({
              path: path.join(outputDir, `${stateID}.pdf`),
              format: 'A4',
              printBackground: true,
            })
            await page.emulateMedia({ media: 'screen' })
          },
        }
      }
    ),
  ]
}
