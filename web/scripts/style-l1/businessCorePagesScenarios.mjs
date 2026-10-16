import { verifyBusinessCoreMasterData } from './businessCoreMasterDataChecks.mjs'
import { verifyBusinessCoreInventory } from './businessCoreInventoryChecks.mjs'
import { verifyBusinessCoreQuality } from './businessCoreQualityChecks.mjs'
import { verifyBusinessCoreShipments } from './businessCoreShipmentChecks.mjs'
import { verifyBusinessCoreProcurement } from './businessCoreProcurementChecks.mjs'
import { verifyBusinessCoreProduction } from './businessCoreProductionChecks.mjs'
import { verifyBusinessCoreFinance } from './businessCoreFinanceChecks.mjs'
import { verifyBusinessCoreAppearance } from './businessCoreAppearanceChecks.mjs'
import { createShipmentFinanceApprovalTaskFixture } from './shipmentApprovalFixtures.mjs'

export function createBusinessCorePagesScenarios(deps) {
  const { customerRuntimeEffectiveSession } = deps
  return [
    {
      name: 'business-core-pages-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-business-core-pages',
        configHash: 'style-l1-business-core-pages-hash',
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'production.fact.cancel',
          'workflow.task.create',
          'workflow.task.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['production', 'warehouse', 'sales', 'finance'],
        },
      },
      workflowTaskFixtures: [
        createShipmentFinanceApprovalTaskFixture({
          sourceID: 9101,
          taskID: 91_01,
          processInstanceID: 19_101,
          processNodeInstanceID: 29_101,
          sourceNo: 'SHIP-REL-L1',
          taskName: '出货财务审批确认',
        }),
        createShipmentFinanceApprovalTaskFixture({
          sourceID: 9103,
          taskID: 91_03,
          processInstanceID: 19_103,
          processNodeInstanceID: 29_103,
          sourceNo: 'SHIP-REL-STALE',
          taskName: '出货财务审批刷新后确认',
        }),
      ],
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await verifyBusinessCoreMasterData(page, deps)
        await verifyBusinessCoreInventory(page, deps)
        await verifyBusinessCoreQuality(page, deps)
        await verifyBusinessCoreShipments(page, deps)
        await verifyBusinessCoreProcurement(page, deps)
        await verifyBusinessCoreProduction(page, deps)
        await verifyBusinessCoreFinance(page, deps)
        await verifyBusinessCoreAppearance(page, deps)
      },
    },
  ]
}
