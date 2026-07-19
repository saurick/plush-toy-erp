import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageLevelAttachmentEntrypoints = [
  '../pages/WorkflowBusinessModulePage.jsx',
  '../pages/V1PurchaseReceiptsPage.jsx',
  '../pages/OperationalFactsPage.jsx',
  '../mobile/components/MobileTaskDetailScreen.jsx',
]

const formModalAttachmentEntrypoints = [
  '../pages/BOMVersionsPage.jsx',
  '../pages/V1MasterDataPage.jsx',
  '../pages/V1OutsourcingOrdersPage.jsx',
  '../pages/V1QualityInspectionsPage.jsx',
  '../components/shipments/ShipmentBusinessModal.jsx',
  '../components/purchase-orders/PurchaseOrderBusinessModal.jsx',
  '../components/sales-orders/SalesOrderBusinessModal.jsx',
]

test('page-level attachment entrypoints open attachments through modal actions', () => {
  for (const relativePath of pageLevelAttachmentEntrypoints) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')

    assert(
      source.includes('BusinessAttachmentModalButton'),
      `${relativePath} should expose page-level attachments through the modal action button`
    )
    assert(
      !source.includes('<BusinessAttachmentPanel'),
      `${relativePath} should not render page-level BusinessAttachmentPanel directly`
    )
  }
})

test('BusinessAttachmentModalButton is the only page-level wrapper around BusinessAttachmentPanel', () => {
  const source = readFileSync(
    new URL(
      '../components/business-list/BusinessAttachmentModalButton.jsx',
      import.meta.url
    ),
    'utf8'
  )

  assert(source.includes('BusinessAttachmentPanel'))
  assert(source.includes('<Modal'))
  assert(source.includes('allowPendingAttachmentsWithoutOwner={false}'))
  assert(source.includes('<PaperClipOutlined aria-hidden="true" />'))
})

test('read-only attachment panels do not expose a fake upload control', () => {
  const source = readFileSync(
    new URL(
      '../components/business-list/BusinessAttachmentPanel.jsx',
      import.meta.url
    ),
    'utf8'
  )

  assert.match(source, /\{canUpload \? \([\s\S]*<Button[\s\S]*<input[\s\S]*\) : null\}/u)
})

test('remaining direct attachment panels stay inside form-backed business modals', () => {
  const modalWrappers = [
    ['<BusinessFormModal', '</BusinessFormModal>'],
    ['<BusinessRecordDetailsModal', '</BusinessRecordDetailsModal>'],
  ]
  for (const relativePath of formModalAttachmentEntrypoints) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    const panelIndexes = [
      ...source.matchAll(/<BusinessAttachmentPanel/g),
    ].map((match) => match.index)

    assert(
      panelIndexes.length > 0,
      `${relativePath} should keep its direct attachment panel explicit`
    )
    for (const panelIndex of panelIndexes) {
      const isInsideFormBackedModal = modalWrappers.some(
        ([startTag, endTag]) =>
          source.lastIndexOf(startTag, panelIndex) >= 0 &&
          source.indexOf(endTag, panelIndex) > panelIndex
      )
      assert(
        isInsideFormBackedModal,
        `${relativePath} direct BusinessAttachmentPanel must remain inside a form-backed business modal`
      )
    }
  }
})

test('BusinessRecordDetailsModal remains a read-only BusinessFormModal wrapper', () => {
  const source = readFileSync(
    new URL(
      '../components/business-list/BusinessRecordDetailsModal.jsx',
      import.meta.url
    ),
    'utf8'
  )

  assert(source.includes("import BusinessFormModal from './BusinessFormModal.jsx'"))
  assert(source.includes('<BusinessFormModal'))
  assert(source.includes('<Button key="close" onClick={onClose}>'))
  assert(!source.includes('onOk='))
})
