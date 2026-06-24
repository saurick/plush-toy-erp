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
  '../pages/ShipmentsPage.jsx',
  '../pages/V1MasterDataPage.jsx',
  '../pages/V1OutsourcingOrdersPage.jsx',
  '../pages/V1PurchaseOrdersPage.jsx',
  '../pages/V1QualityInspectionsPage.jsx',
  '../pages/V1SalesOrdersPage.jsx',
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
})

test('remaining direct attachment panels stay inside business form modals', () => {
  for (const relativePath of formModalAttachmentEntrypoints) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    const panelIndex = source.indexOf('<BusinessAttachmentPanel')
    const modalStartIndex = source.lastIndexOf('<BusinessFormModal', panelIndex)
    const modalEndIndex = source.indexOf('</BusinessFormModal>', panelIndex)

    assert.notEqual(
      panelIndex,
      -1,
      `${relativePath} should keep its direct attachment panel explicit`
    )
    assert(
      modalStartIndex >= 0 && modalEndIndex > panelIndex,
      `${relativePath} direct BusinessAttachmentPanel must remain inside BusinessFormModal`
    )
  }
})
