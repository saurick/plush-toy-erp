import assert from 'node:assert/strict'

import test from 'node:test'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

import {
  PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES,
  PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE,
  PRODUCT_IMAGE_SNAPSHOT_MAX_PIXELS,
  PRODUCT_IMAGE_SLOT_DEFINITIONS,
  PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT,
  buildOptimizedProductImageFileName,
  buildProductImageMutationPlan,
  calculateProductImageSnapshotSize,
  confirmProductImageMutation,
  createProductImageSession,
  inferProductImageMimeType,
  readProductImageMimeType,
  reconcileSupplementalProductImages,
  resetProductImageSession,
  selectSavedProductImages,
  selectSavedSupplementalProductImages,
  stageProductImageClear,
  stageProductImageSelection,
  stageSupplementalProductImageRemoval,
  stageSupplementalProductImage,
  shouldOptimizeProductImageSnapshot,
  supplementalProductImageOverflow,
  validateProductImageFile,
  undoSupplementalProductImageRemoval,
  visibleSupplementalProductImages,
} from './productImageSlots.mjs'

function attachment(slotKey, id, attachmentType = 'product_image') {
  return {
    id,
    attachment_type: attachmentType,
    slot_key: slotKey,
    file_name: `${slotKey}-${id}.png`,
    mime_type: 'image/png',
    file_size: 128,
    sha256: String(id).padStart(64, '0'),
  }
}

function pending(fileName = 'pending.png') {
  return {
    file_name: fileName,
    mime_type: 'image/png',
    file_size: 256,
    content_base64: 'cHJvZHVjdC1pbWFnZQ==',
    preview_url: 'blob:pending-product-image',
  }
}

test('product image slots map the 0, 1 and 2 image states by fixed business position', () => {
  assert.deepEqual(selectSavedProductImages([]), {
    primary: null,
    secondary: null,
  })

  const primary = attachment('primary', 11)
  assert.deepEqual(selectSavedProductImages([primary]), {
    primary,
    secondary: null,
  })

  const secondary = attachment('secondary', 12)
  assert.deepEqual(selectSavedProductImages([primary, secondary]), {
    primary,
    secondary,
  })

  assert.deepEqual(
    selectSavedProductImages([
      primary,
      attachment('primary', 99),
      attachment('secondary', 88, 'evidence'),
      attachment('unsupported', 77),
    ]),
    { primary, secondary: null },
    'the newest fixed-slot image wins and ordinary attachments stay separate'
  )
})

test('supplemental drafts keep fixed image roles, restore an individual removal and retry unfinished changes only', () => {
  const primary = attachment('primary', 11)
  const extras = selectSavedSupplementalProductImages([
    attachment('supplemental_1', 34),
    attachment('supplemental_2', 22),
    primary,
    attachment('supplemental_9', 35),
  ])
  assert.deepEqual(extras.map(({ id }) => id), [22, 34])
  const original = createProductImageSession({ primary }, extras)
  const removed = stageSupplementalProductImageRemoval(original, extras[0])
  assert.deepEqual(visibleSupplementalProductImages(undoSupplementalProductImageRemoval(removed)), extras)
  const files = Array.from({ length: PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT - 1 }, (_, index) => ({
    ...pending(`detail-${index}.png`), pendingKey: `detail-${index}`, sha256: String(index + 50).padStart(64, '0'),
  }))
  const staged = files.reduce((draft, file) => stageSupplementalProductImage(draft, file).session, removed)
  assert.equal(visibleSupplementalProductImages(staged).length, PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT)
  const overflow = stageSupplementalProductImage(staged, { ...files[0], sha256: 'a'.repeat(64) })
  assert.equal(overflow.outcome, 'full')
  assert.equal(overflow.session, staged)
  const duplicateAtLimit = stageSupplementalProductImage(staged, { ...files[0], file_name: 'renamed.png' })
  assert.equal(duplicateAtLimit.outcome, 'duplicate')
  assert.equal(duplicateAtLimit.session, staged)
  const plan = buildProductImageMutationPlan(staged)
  assert.deepEqual(plan[0], { type: 'remove', id: 22 })
  assert.equal(plan[1].slotKey, 'supplemental')
  const afterRemoval = confirmProductImageMutation(staged, plan[0])
  const afterAppend = confirmProductImageMutation(afterRemoval, plan[1], attachment('supplemental_2', 46))
  assert.deepEqual(buildProductImageMutationPlan(afterAppend), plan.slice(2))
  assert.deepEqual(visibleSupplementalProductImages(resetProductImageSession(afterAppend)).map(({ id }) => id), [34, 46])
  assert.equal(afterAppend.slots.primary.saved, primary)
})

test('supplemental selection compares saved and pending content without reserving space for a duplicate', () => {
  const primary = attachment('primary', 11)
  const saved = attachment('supplemental_1', 24)
  const initial = createProductImageSession({ primary }, [saved])
  const file = { ...pending(saved.file_name), pendingKey: 'selected', sha256: primary.sha256 }
  const sameName = stageSupplementalProductImage(initial, file)
  assert.equal(sameName.outcome, 'added', 'same name or content matching the main slot must not block supplemental selection')
  const duplicateOfSaved = stageSupplementalProductImage(sameName.session, {
    ...file, file_name: 'renamed.png', sha256: saved.sha256,
  })
  assert.equal(duplicateOfSaved.outcome, 'duplicate')
  assert.equal(duplicateOfSaved.session, sameName.session)
  const duplicateOfPending = stageSupplementalProductImage(sameName.session, { ...file, pendingKey: 'copy' })
  assert.equal(duplicateOfPending.outcome, 'duplicate')
  assert.equal(visibleSupplementalProductImages(duplicateOfPending.session).length, 2)
  const removed = stageSupplementalProductImageRemoval(initial, saved)
  const reselected = stageSupplementalProductImage(removed, { ...file, sha256: saved.sha256 })
  assert.equal(reselected.outcome, 'restored')
  assert.deepEqual(visibleSupplementalProductImages(reselected.session), [saved])
  assert.deepEqual(buildProductImageMutationPlan(reselected.session), [])
})

test('supplemental readback settles matching uploads and removals by ID without dropping other drafts', () => {
  const previous = attachment('supplemental_1', 23)
  const replacement = attachment('supplemental_1', 24)
  const uploaded = attachment('supplemental_2', 25)
  const confirmed = { ...pending('confirmed.png'), pendingKey: 'confirmed', sha256: uploaded.sha256 }
  const unsent = { ...pending('unsent.png'), pendingKey: 'unsent', sha256: 'a'.repeat(64) }
  const initial = createProductImageSession({ primary: attachment('primary', 11) }, [previous])
  let draft = stageProductImageSelection(initial, 'primary', pending('new-primary.png'))
  draft = stageSupplementalProductImageRemoval(draft, previous)
  draft = stageSupplementalProductImage(draft, confirmed).session
  draft = stageSupplementalProductImage(draft, unsent).session
  const refreshed = reconcileSupplementalProductImages(draft, [uploaded, replacement])
  assert.equal(refreshed.slots, draft.slots)
  assert.deepEqual(visibleSupplementalProductImages(refreshed), [replacement, uploaded, unsent])
  assert.deepEqual(buildProductImageMutationPlan(refreshed).map(({ type }) => type), ['upload', 'append'])
  assert.equal(supplementalProductImageOverflow(refreshed), 0)
})

test('product image edits create upload or clear plans and cancel restores backend state', () => {
  const primary = attachment('primary', 21)
  const secondary = attachment('secondary', 22)
  const original = createProductImageSession({ primary, secondary })

  const replaced = stageProductImageSelection(
    original,
    'primary',
    pending('replacement.webp')
  )
  assert.deepEqual(buildProductImageMutationPlan(replaced), [
    {
      type: 'upload',
      slotKey: 'primary',
      image: pending('replacement.webp'),
    },
  ])

  const cleared = stageProductImageClear(replaced, 'secondary')
  assert.deepEqual(buildProductImageMutationPlan(cleared), [
    {
      type: 'upload',
      slotKey: 'primary',
      image: pending('replacement.webp'),
    },
    { type: 'clear', slotKey: 'secondary' },
  ])

  const cancelled = resetProductImageSession(cleared)
  assert.deepEqual(cancelled, original)
  assert.deepEqual(buildProductImageMutationPlan(cancelled), [])

  const newProductSelection = stageProductImageSelection(
    createProductImageSession(),
    'primary',
    pending()
  )
  assert.equal(buildProductImageMutationPlan(newProductSelection).length, 1)
  assert.deepEqual(
    buildProductImageMutationPlan(
      stageProductImageClear(newProductSelection, 'primary')
    ),
    [],
    'clearing a not-yet-saved image must not write a backend clear'
  )
})

test('product image validation accepts PNG, JPEG and WEBP source files without a configured size ceiling', () => {
  for (const [name, type] of [
    ['product.png', 'image/png'],
    ['product.jpg', 'image/jpeg'],
    ['product.jpeg', 'image/jpeg'],
    ['product.webp', 'image/webp'],
  ]) {
    const file = { name, type, size: Number.MAX_SAFE_INTEGER }
    assert.equal(inferProductImageMimeType(file), type)
    assert.equal(validateProductImageFile(file), '')
  }

  assert.match(
    validateProductImageFile({
      name: 'product.gif',
      type: 'image/gif',
      size: 128,
    }),
    /格式不支持/u
  )
  assert.match(
    validateProductImageFile({
      name: 'empty.png',
      type: 'image/png',
      size: 0,
    }),
    /内容为空/u
  )
})

test('product image preparation rejects a readable file renamed to a different format', async () => {
  const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const expected = new File([pngHeader], 'product.PNG', { type: 'application/octet-stream' })
  assert.equal(await readProductImageMimeType(expected), 'image/png')
  const disguised = new File([pngHeader], 'product.jpg', { type: 'image/jpeg' })
  await assert.rejects(readProductImageMimeType(disguised), /图片实际格式与扩展名不符/u)
  const noExtension = new File([pngHeader], 'product', { type: 'image/png' })
  assert.match(validateProductImageFile(noExtension), /格式不支持/u)
})

test('product image snapshot sizing keeps print images inside the browser storage budget', () => {
  assert.deepEqual(calculateProductImageSnapshotSize(1600, 900), {
    width: 1600,
    height: 900,
    scale: 1,
  })

  const landscape = calculateProductImageSnapshotSize(12_000, 8_000)
  assert(landscape.width <= PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE)
  assert(landscape.height <= PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE)
  assert(
    landscape.width * landscape.height <= PRODUCT_IMAGE_SNAPSHOT_MAX_PIXELS
  )
  assert.equal(
    shouldOptimizeProductImageSnapshot({
      fileSize: PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES + 1,
      width: 1600,
      height: 900,
    }),
    true
  )
  assert.equal(
    shouldOptimizeProductImageSnapshot({
      fileSize: 128,
      width: 1600,
      height: 900,
    }),
    false
  )
  assert.equal(
    buildOptimizedProductImageFileName('毛绒主图.PNG', 'image/webp'),
    '毛绒主图.webp'
  )
  assert.equal(buildOptimizedProductImageFileName('', 'image/webp'), '产品图片.webp')
  assert.equal(buildOptimizedProductImageFileName('毛绒主图.jpeg', 'image/png'), '毛绒主图.png')
})

test('product page integrates dedicated slots without changing SKU attachment semantics', () => {
  const pageSource = readFileSync(
    new URL('../pages/MasterDataPage.jsx', import.meta.url),
    'utf8'
  )
  const componentSource = readFileSync(
    new URL('../components/master-data/ProductImageSlots.jsx', import.meta.url),
    'utf8'
  )
  const apiSource = readFileSync(
    new URL('../api/attachmentApi.mjs', import.meta.url),
    'utf8'
  )

  const editorSource = readFileSync(new URL('../components/master-data/ProductRecordEditor.jsx', import.meta.url), 'utf8')
  assert.match(pageSource, /<ProductRecordEditor/u)
  assert.match(editorSource, /type === 'products'[^\n]*<ProductImageSlots/u)
  assert.match(editorSource, /ownerType="product_sku"/u)
  assert.match(editorSource, /flushChanges\(saved\.id\)/u)
  assert.match(editorSource, /mutationsApplied[\s\S]*?reloaded/u)
  assert.match(editorSource, /产品和产品图片已保存，图片状态尚未确认/u)
  assert.match(editorSource, /persisted\.current = saved/u)
  assert.match(editorSource, /confirmLoading=\{saving\}/u)
  assert.match(editorSource, /canEdit=\{canUploadImages\}/u)
  assert.deepEqual(
    PRODUCT_IMAGE_SLOT_DEFINITIONS.map(({ label }) => label),
    ['产品图 1（主图）', '产品图 2（辅图）']
  )
  assert.match(
    componentSource,
    /mutationsApplied: true, reloaded: false/u,
    'successful writes with a failed readback need an honest independent result'
  )
  assert.match(
    componentSource,
    /setSaving\(true\)\s*try \{[\s\S]*?return \{ mutationsApplied: false, reloaded: false \}[\s\S]*?\} finally \{\s*if \(isCurrent\(\)\) setSaving\(false\)/u,
    'every failed preparation or mutation must release saving for the active editor'
  )
  assert.match(componentSource, /cancelSession/u)
  assert.match(
    componentSource,
    /function handleClear\(slotKey\)[\s\S]*?fileReadSequenceRef\.current\[slotKey\] \+= 1[\s\S]*?delete filePreparationPromisesRef\.current\[slotKey\]/u,
    'clearing a slot must invalidate an in-flight file read'
  )
  assert.match(
    componentSource,
    /useEffect\(\(\) => \{\s*if \(open\) beginSession\(productId\)/u,
    'the image component must load saved slots when the first edit modal mounts'
  )
  assert.match(apiSource, /call\('clear_product_image'/u)
  assert.match(
    apiSource,
    /call\('clear_product_image',[\s\S]*?owner_id: productID/u
  )
  assert.doesNotMatch(
    apiSource.match(/call\('clear_product_image',[\s\S]*?\n {2}\}\)/u)?.[0] ||
      '',
    /owner_type/u,
    'clear_product_image is already product-scoped and must not send owner_type'
  )
})
