import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  PRODUCT_IMAGE_MAX_FILE_SIZE,
  PRODUCT_IMAGE_SLOT_DEFINITIONS,
  buildProductImageMutationPlan,
  createProductImageSession,
  inferProductImageMimeType,
  resetProductImageSession,
  selectSavedProductImages,
  stageProductImageClear,
  stageProductImageSelection,
  validateProductImageFile,
} from './productImageSlots.mjs'

function attachment(slotKey, id, attachmentType = 'product_image') {
  return {
    id,
    attachment_type: attachmentType,
    slot_key: slotKey,
    file_name: `${slotKey}-${id}.png`,
    mime_type: 'image/png',
    file_size: 128,
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

test('product image validation accepts PNG, JPEG and WEBP up to 5MB', () => {
  for (const [name, type] of [
    ['product.png', 'image/png'],
    ['product.jpg', 'image/jpeg'],
    ['product.jpeg', 'image/jpeg'],
    ['product.webp', 'image/webp'],
  ]) {
    const file = { name, type, size: PRODUCT_IMAGE_MAX_FILE_SIZE }
    assert.equal(inferProductImageMimeType(file), type)
    assert.equal(validateProductImageFile(file), '')
  }

  assert.match(
    validateProductImageFile({
      name: 'too-large.png',
      type: 'image/png',
      size: PRODUCT_IMAGE_MAX_FILE_SIZE + 1,
    }),
    /超过 5MB/u
  )
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

test('product page integrates dedicated slots without changing SKU attachment semantics', () => {
  const pageSource = readFileSync(
    new URL('../pages/V1MasterDataPage.jsx', import.meta.url),
    'utf8'
  )
  const componentSource = readFileSync(
    new URL(
      '../components/master-data/ProductImageSlots.jsx',
      import.meta.url
    ),
    'utf8'
  )
  const apiSource = readFileSync(
    new URL('../api/attachmentApi.mjs', import.meta.url),
    'utf8'
  )

  assert.match(
    pageSource,
    /effectiveType === 'products'[\s\S]*?<ProductImageSlots/u
  )
  assert.match(
    pageSource,
    /effectiveType === 'product_skus'[\s\S]*?<BusinessAttachmentPanel/u
  )
  assert.match(pageSource, /flushChanges\(saved\?\.id\)/u)
  assert.match(pageSource, /产品已保存，产品图未全部更新/u)
  assert.match(
    pageSource,
    /productImageResult\?\.mutationsApplied === true[\s\S]*?productImageResult\?\.reloaded === true/u,
    'the product save flow must distinguish image writes from the follow-up readback'
  )
  assert.match(
    pageSource,
    /产品和产品图已保存，但当前图片状态暂未刷新/u,
    'a readback failure after successful writes must not be reported as a partial image write'
  )
  assert.match(
    pageSource,
    /if \(!productImagesApplied\)[\s\S]*?setEditingRecord\(saved \|\| editingRecord\)[\s\S]*?await loadRecords\(\)[\s\S]*?beginSession\(saved\?\.id\)[\s\S]*?return/u,
    'a partial image write must keep the saved product in update mode for an in-place retry'
  )
  assert.match(
    pageSource,
    /onCancel=\{\(\) => \{\s*if \(saving \|\| contactLoading\) return[\s\S]*?cancelButtonProps=\{\{ disabled: saving \|\| contactLoading \}\}[\s\S]*?closable=\{!\(saving \|\| contactLoading\)\}[\s\S]*?keyboard=\{!\(saving \|\| contactLoading\)\}/u,
    'the modal must not close while product and image writes are in flight'
  )
  assert.match(pageSource, /<ProductImageSlots[\s\S]*?canEdit=\{canUpdate\}/u)
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
    /setSaving\(true\)\s*try \{[\s\S]*?return \{ mutationsApplied: false, reloaded: false \}[\s\S]*?\} finally \{\s*if \(mountedRef\.current\) setSaving\(false\)/u,
    'every failed preparation or mutation return must release the image saving state'
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
    apiSource.match(/call\('clear_product_image',[\s\S]*?\n {2}\}\)/u)?.[0] || '',
    /owner_type/u,
    'clear_product_image is already product-scoped and must not send owner_type'
  )
})
