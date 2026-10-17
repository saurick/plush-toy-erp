import { createBusinessFormPagesScenarios } from './businessFormPagesScenarios.mjs'
import { createSalesOrderSubmissionScenarios } from './salesOrderSubmissionScenarios.mjs'
import { createWarehouseClassificationScenarios } from './warehouseClassificationScenarios.mjs'
import { createOrderEngineeringScenarios } from './orderEngineeringScenarios.mjs'
import { createBOMTaskActionsScenarios } from './bomTaskActionsScenarios.mjs'
import { createBOMRevisionScenarios } from './bomRevisionScenarios.mjs'
import { createBOMMaterialGroupsScenarios } from './bomMaterialGroupsScenarios.mjs'

import { createOutsourcingSourceFactScenarios } from './outsourcingSourceFactScenarios.mjs'
import { createProductionSourceInboundLotScenarios } from './productionSourceInboundLotScenarios.mjs'
import { createProductionReworkScenarios } from './productionReworkScenarios.mjs'
import { createProductImageSlotScenarios } from './productImageSlotScenarios.mjs'
import { createProductionWipScenarios } from './productionWipScenarios.mjs'
import { createQualitySourceActionScenarios } from './qualitySourceActionScenarios.mjs'

import { createSalesOrderSkuGrainScenarios } from './salesOrderSkuGrainScenarios.mjs'
import { createSalesOrderDemandEntryScenarios } from './salesOrderDemandEntryScenarios.mjs'
import { createSourceDocumentReadRecoveryScenarios } from './sourceDocumentReadRecoveryScenarios.mjs'
import {
  createShipmentWeightScenarios,
  createShipmentSourceCandidateScenarios,
} from './shipmentPresentationScenarios.mjs'
import {
  createMasterDataFieldScenarios,
  createSupplierProcessingScenarios,
} from './masterDataFieldScenarios.mjs'
import { createInventoryPresentationScenarios } from './inventoryPresentationScenarios.mjs'
import {
  createBusinessRecordNavigationScenarios,
  createBusinessHeaderScenarios,
} from './businessListPresentationScenarios.mjs'
import { createProductionRecordScenarios } from './productionRecordScenarios.mjs'
import {
  createShipmentReleasePermissionScenarios,
  createShipmentReleaseReadonlyScenarios,
} from './shipmentReleaseScenarios.mjs'
import { createSalesOrderAcceptanceScenarios } from './salesOrderAcceptanceScenarios.mjs'
import { createSalesOrderReservationScenarios } from './salesOrderReservationScenarios.mjs'
import { createProductionMaterialIssueScenarios } from './productionMaterialIssueScenarios.mjs'
import { createBusinessAttachmentRecoveryScenarios } from './businessAttachmentRecoveryScenarios.mjs'
import { createBusinessCorePagesScenarios } from './businessCorePagesScenarios.mjs'
import { createCompactPageScenarios } from './compactPageScenarios.mjs'

export function createBusinessFormalScenarios(deps) {
  return [
    ...createCompactPageScenarios(deps),
    ...createSalesOrderDemandEntryScenarios(deps),
    ...createSalesOrderSkuGrainScenarios(deps),
    ...createSalesOrderSubmissionScenarios(deps),
    ...createBOMMaterialGroupsScenarios(deps),
    ...createBOMTaskActionsScenarios(deps),
    ...createBOMRevisionScenarios(deps),
    ...createBusinessFormPagesScenarios(deps),
    ...createWarehouseClassificationScenarios(deps),
    ...createOrderEngineeringScenarios(deps),
    ...createOutsourcingSourceFactScenarios(deps),
    ...createProductionSourceInboundLotScenarios(deps),
    ...createProductionReworkScenarios(deps),
    ...createProductionWipScenarios(deps),
    ...createProductImageSlotScenarios(deps),
    ...createQualitySourceActionScenarios(deps),
    ...createSourceDocumentReadRecoveryScenarios(deps),
    ...createShipmentWeightScenarios(deps),
    ...createMasterDataFieldScenarios(deps),
    ...createInventoryPresentationScenarios(deps),
    ...createBusinessRecordNavigationScenarios(deps),
    ...createShipmentSourceCandidateScenarios(deps),
    ...createProductionRecordScenarios(deps),
    ...createSupplierProcessingScenarios(deps),
    ...createBusinessHeaderScenarios(deps),
    ...createBusinessCorePagesScenarios(deps),
    ...createShipmentReleasePermissionScenarios(deps),
    ...createSalesOrderAcceptanceScenarios(deps),
    ...createSalesOrderReservationScenarios(deps),
    ...createProductionMaterialIssueScenarios(deps),
    ...createShipmentReleaseReadonlyScenarios(deps),
    ...createBusinessAttachmentRecoveryScenarios(deps),
  ]
}
