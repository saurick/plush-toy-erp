import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const pageSource = readFileSync(
  fileURLToPath(new URL('../pages/BOMVersionsPage.jsx', import.meta.url)),
  'utf8'
)
const apiSource = readFileSync(
  fileURLToPath(new URL('../api/bomApi.mjs', import.meta.url)),
  'utf8'
)

test('BOM form saves header and authoritative items through one aggregate RPC', () => {
  assert.match(apiSource, /call\(\s*'save_bom_with_items'/u)
  assert.match(pageSource, /saveBOMWithItems\(\{/u)
  assert.match(
    pageSource,
    /expected_version:\s*modalActionVersion\?\.edit_version/u
  )
  assert.match(pageSource, /items:\s*\(Array\.isArray\(values\.items\)/u)
})

test('BOM form no longer orchestrates split header and item writes', () => {
  for (const retiredName of [
    'createBOMDraft',
    'updateBOMDraft',
    'addBOMItem',
    'updateBOMItem',
    'deleteBOMItem',
    'syncBOMItems',
  ]) {
    assert.doesNotMatch(pageSource, new RegExp(retiredName, 'u'))
  }
})

test('BOM form is mounted before open handlers initialize its form instance', () => {
  const editorStart = pageSource.indexOf(
    '<BusinessFormPage\n        open={headerModalOpen}'
  )
  const editor = readFileSync(
    new URL(
      '../components/business-list/BusinessFormPage.jsx',
      import.meta.url
    ),
    'utf8'
  )
  assert.ok(editorStart >= 0)
  assert.match(editor, /hidden=\{!open\}/u)
  assert.match(editor, /\{children\}/u)
  assert.doesNotMatch(editor, /if\s*\(!open\)\s*return null/u)
  assert.match(
    pageSource,
    /const openCreate = \(\) => \{[\s\S]*headerForm\.resetFields/u
  )
})

test('BOM copy and catalog source choices are not truncated by fixed page limits', () => {
  for (const completeReader of [
    'listAllBOMVersions',
    'listAllMaterials',
    'listAllProducts',
    'listAllUnits',
  ]) {
    assert.match(pageSource, new RegExp(completeReader, 'u'))
  }
  assert.doesNotMatch(
    pageSource,
    /listBOMVersions\(\{\s*product_id:[^}]*limit:\s*200/u
  )
  assert.doesNotMatch(
    pageSource,
    /list(?:Products|Materials|Units)\(\{[^}]*limit:\s*500/u
  )
})

test('BOM material entry delegates execution decisions to production', () => {
  const groupForm = readFileSync(
    fileURLToPath(
      new URL('../components/bom/BOMMaterialGroupsForm.jsx', import.meta.url)
    ),
    'utf8'
  )
  assert.match(pageSource, /BOMMaterialGroupsForm/u)
  assert.doesNotMatch(groupForm, /label=["'](?:生产工序归属|内做外发)/u)
  assert.doesNotMatch(pageSource, /includes\([^)]*(?:面料|布料)/u)
})
