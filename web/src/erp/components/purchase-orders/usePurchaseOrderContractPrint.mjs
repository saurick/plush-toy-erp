import { useCallback, useState } from 'react'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from '../../utils/masterDataOrderView.mjs'
import {
  completeMaterialPurchaseContractDraft,
  mergeSnapshotMissingFields,
} from '../../utils/contractPrintDraftCompleteness.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
} from '../../utils/printWorkspace.js'

export function usePurchaseOrderContractPrint({
  loadOrderItems,
  materials = [],
  printTemplateDefaults = {},
  unitOptions = [],
  customerKey = '',
  suppliers = [],
  resolveSupplierSnapshot,
}) {
  const [printingContract, setPrintingContract] = useState(false)

  const printPurchaseContract = useCallback(
    async (record) => {
      if (!record) {
        return
      }
      setPrintingContract(true)
      try {
        const items = await loadOrderItems(record)
        if (items.length === 0) {
          message.warning('当前采购订单没有可打印的明细')
          return
        }
        const supplier = suppliers.find((item) => item.id === record.supplier_id)
        const liveSupplierSnapshot =
          typeof resolveSupplierSnapshot === 'function' && supplier
            ? await resolveSupplierSnapshot(supplier)
            : {}
        const printRecord = {
          ...record,
          supplier_snapshot: mergeSnapshotMissingFields(
            record.supplier_snapshot,
            liveSupplierSnapshot
          ),
        }
        const initialDraft = completeMaterialPurchaseContractDraft(
          buildMaterialPurchaseContractDraftFromPurchaseOrder(printRecord, items, {
            materials,
            printTemplateDefaults,
            unitOptions,
          })
        )
        openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
          entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
          initialDraft,
          customerKey,
        })
        message.success('已打开采购合同打印模板')
      } catch (error) {
        message.error(getActionErrorMessage(error, '打开采购合同打印模板失败'))
      } finally {
        setPrintingContract(false)
      }
    },
    [
      customerKey,
      loadOrderItems,
      materials,
      printTemplateDefaults,
      resolveSupplierSnapshot,
      suppliers,
      unitOptions,
    ]
  )

  return {
    printPurchaseContract,
    printingContract,
  }
}
