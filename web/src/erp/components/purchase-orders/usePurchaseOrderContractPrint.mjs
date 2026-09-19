import { useCallback, useEffect, useRef, useState } from 'react'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  getPurchaseOrder,
  listAllPurchaseOrderItems,
  listAllMaterials,
  listAllUnits,
  listAllSuppliers,
  listAllContactsByOwner,
} from '../../api/masterDataOrderApi.mjs'
import {
  unitOption,
  uniqueReferenceOptions,
} from '../../utils/referenceSelectOptions.mjs'
import {
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  SUPPLIER_CONTACT_OWNER_TYPE,
} from '../../utils/sourcePartySnapshots.mjs'
import { getPrintTemplateByKey } from '../../config/printTemplates.mjs'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from '../../utils/purchaseOrderPrintDraft.mjs'
import {
  completeMaterialPurchaseContractDraft,
  mergeSnapshotMissingFields,
} from '../../utils/contractPrintDraftCompleteness.mjs'
import {
  buildMaterialPurchaseContractBusinessDraft,
  MATERIAL_PURCHASE_MAX_ROWS,
} from '../../utils/materialPurchaseContractEditor.mjs'
import {
  buildMaterialPurchaseContractBatchDraft,
  groupMaterialPurchaseContracts,
} from '../../utils/materialPurchaseContractBatch.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
} from '../../utils/printWorkspace.js'

async function loadItems(record, options) {
  const data = await listAllPurchaseOrderItems(
    {
      purchase_order_id: record.id,
      expected_version: record.version,
    },
    options
  )
  return data.purchase_order_items
}

async function loadReferences(options) {
  const [materialData, unitData, supplierData] = await Promise.all([
    listAllMaterials({ active_only: false }, options),
    listAllUnits({}, options),
    listAllSuppliers({ active_only: false }, options),
  ])
  return {
    materials: materialData.materials,
    unitOptions: uniqueReferenceOptions(unitData.units, unitOption),
    suppliers: supplierData.suppliers,
  }
}

async function loadSupplierSnapshot(supplier, options) {
  try {
    const data = await listAllContactsByOwner(
      {
        owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
        owner_id: supplier.id,
        active_only: true,
      },
      options
    )
    return buildSupplierSnapshotWithContacts(supplier, data.contacts || [])
  } catch (error) {
    if (isRpcAbortError(error)) throw error
    return buildSupplierSnapshot(supplier)
  }
}

export function usePurchaseOrderContractPrint({
  loadOrderItems = loadItems,
  loadPrintReferenceData = loadReferences,
  materials = [],
  printTemplateDefaults = {},
  unitOptions = [],
  customerKey = '',
  accountKey = '',
  configRevision = '',
  suppliers = [],
  resolveSupplierSnapshot = loadSupplierSnapshot,
} = {}) {
  const [printingContract, setPrintingContract] = useState(false)
  const pending = useRef(null)
  useEffect(() => () => pending.current?.abort(), [])

  const loadPurchaseContractDrafts = useCallback(
    async (records, options) => {
      const referenceData =
        typeof loadPrintReferenceData === 'function'
          ? await loadPrintReferenceData(options)
          : {}
      const printMaterials = Array.isArray(referenceData?.materials)
        ? referenceData.materials
        : materials
      const printUnitOptions = Array.isArray(referenceData?.unitOptions)
        ? referenceData.unitOptions
        : unitOptions
      const supplierSnapshotPromises = new Map()
      const printSuppliers = referenceData?.suppliers || suppliers
      const contracts = []

      // 汇总表可带入多批合同；限制同时读取数量，不截断业务范围。
      for (let offset = 0; offset < records.length; offset += 4) {
        if (options.signal.aborted) return []
        const group = await Promise.all(
          records.slice(offset, offset + 4).map(async (source) => {
            const record = await getPurchaseOrder({ id: source.id }, options)
            if (!record || Number(record.id) !== Number(source.id)) {
              throw new Error('采购订单已变化，请刷新后重试')
            }
            const supplier = printSuppliers.find(
              (item) => item.id === record.supplier_id
            )
            const supplierKey = Number(supplier?.id || 0)
            if (
              supplierKey > 0 &&
              typeof resolveSupplierSnapshot === 'function' &&
              !supplierSnapshotPromises.has(supplierKey)
            ) {
              supplierSnapshotPromises.set(
                supplierKey,
                Promise.resolve(resolveSupplierSnapshot(supplier, options))
              )
            }
            const [items, liveSupplierSnapshot] = await Promise.all([
              loadOrderItems(record, options),
              supplierSnapshotPromises.get(supplierKey) || Promise.resolve({}),
            ])
            const printRecord = {
              ...record,
              supplier_snapshot: mergeSnapshotMissingFields(
                record.supplier_snapshot,
                liveSupplierSnapshot
              ),
            }
            return {
              record,
              items,
              draft: completeMaterialPurchaseContractDraft(
                buildMaterialPurchaseContractDraftFromPurchaseOrder(
                  printRecord,
                  items,
                  {
                    materials: printMaterials,
                    printTemplateDefaults,
                    unitOptions: printUnitOptions,
                  }
                )
              ),
            }
          })
        )
        contracts.push(...group)
      }
      return contracts
    },
    [
      loadOrderItems,
      loadPrintReferenceData,
      materials,
      printTemplateDefaults,
      resolveSupplierSnapshot,
      suppliers,
      unitOptions,
    ]
  )

  const printPurchaseContract = useCallback(
    async (record) => {
      if (!record || pending.current) {
        return
      }
      setPrintingContract(true)
      const controller = new AbortController()
      pending.current = controller
      try {
        const [contract] = await loadPurchaseContractDrafts([record], {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (!contract?.items?.length) {
          message.warning('当前采购订单没有可打印的明细')
          return
        }
        openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
          entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
          initialDraft: contract.draft,
          customerKey,
          accountKey,
          configRevision,
        })
        message.success('已打开采购合同打印模板')
      } catch (error) {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        message.error(getActionErrorMessage(error, '打开采购合同打印模板失败'))
      } finally {
        pending.current = null
        if (!controller.signal.aborted) setPrintingContract(false)
      }
    },
    [accountKey, configRevision, customerKey, loadPurchaseContractDrafts]
  )

  const printPurchaseContracts = useCallback(
    async (records = [], { sourceLabel = '' } = {}) => {
      if (pending.current) return
      const uniqueRecords = Array.from(
        new Map(
          (Array.isArray(records) ? records : [])
            .filter(Boolean)
            .map((record) => [
              Number(record.id || 0) || String(record.purchase_order_no || ''),
              record,
            ])
        ).values()
      )
      if (uniqueRecords.length === 0) {
        return
      }
      setPrintingContract(true)
      const controller = new AbortController()
      pending.current = controller
      try {
        const template = getPrintTemplateByKey(
          MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
        )
        if (!template) {
          throw new Error('未找到采购合同打印模板')
        }
        const contracts = await loadPurchaseContractDrafts(uniqueRecords, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const emptyOrders = contracts.filter(
          (contract) => !contract?.items?.length
        )
        if (emptyOrders.length > 0) {
          const orderNos = emptyOrders
            .slice(0, 3)
            .map(
              ({ record }) =>
                String(record?.purchase_order_no || '').trim() ||
                `采购订单 ${record?.id || ''}`.trim()
            )
          message.warning(
            `${orderNos.join('、')}${
              emptyOrders.length > orderNos.length
                ? `等 ${emptyOrders.length} 份订单`
                : ''
            }没有可打印的明细，请核对后再批量打印`
          )
          return
        }

        const grouped = groupMaterialPurchaseContracts(
          contracts.map(({ record, draft }) => ({
            record,
            draft: buildMaterialPurchaseContractBusinessDraft(
              draft,
              template.sample
            ),
          }))
        )
        const oversized = grouped.find(
          (contract) => contract.draft.lines.length > MATERIAL_PURCHASE_MAX_ROWS
        )
        if (oversized) {
          message.warning(
            `${oversized.supplierName || '所选供应商'}合并后有 ${oversized.draft.lines.length} 行明细，单份合同最多 ${MATERIAL_PURCHASE_MAX_ROWS} 行，请减少本次选择的采购单`
          )
          return
        }
        const initialDraft = buildMaterialPurchaseContractBatchDraft(grouped, {
          sourceLabel,
        })

        openPrintWorkspaceWindow(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, {
          entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
          initialDraft,
          customerKey,
          accountKey,
          configRevision,
        })
        message.success(
          `已打开 ${initialDraft.contracts.length} 份采购合同的批量打印窗口`
        )
      } catch (error) {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        message.error(
          getActionErrorMessage(error, '打开采购合同批量打印窗口失败')
        )
      } finally {
        pending.current = null
        if (!controller.signal.aborted) setPrintingContract(false)
      }
    },
    [accountKey, configRevision, customerKey, loadPurchaseContractDrafts]
  )

  return {
    printPurchaseContract,
    printPurchaseContracts,
    printingContract,
  }
}
