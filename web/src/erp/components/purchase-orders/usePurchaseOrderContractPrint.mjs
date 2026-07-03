import { useCallback, useState } from 'react'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from '../../utils/masterDataOrderView.mjs'
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
        const initialDraft =
          buildMaterialPurchaseContractDraftFromPurchaseOrder(record, items, {
            materials,
            printTemplateDefaults,
            unitOptions,
          })
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
    [customerKey, loadOrderItems, materials, printTemplateDefaults, unitOptions]
  )

  return {
    printPurchaseContract,
    printingContract,
  }
}
