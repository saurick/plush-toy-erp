import assert from 'node:assert/strict'

import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createElement as h, useState } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

const pageSource = readFileSync(
  fileURLToPath(new URL('../pages/BOMVersionsPage.jsx', import.meta.url)),
  'utf8'
)
const editorSource = readFileSync(fileURLToPath(new URL('../components/bom/BOMEditor.jsx', import.meta.url)), 'utf8')
const apiSource = readFileSync(
  fileURLToPath(new URL('../api/bomApi.mjs', import.meta.url)),
  'utf8'
)

test('BOM form saves header and authoritative items through one aggregate RPC', () => {
  assert.match(apiSource, /call\(\s*'save_bom_with_items'/u)
  assert.match(pageSource, /<BOMEditor/u)
  assert.match(editorSource, /saveBOMWithItems\(\{/u)
  assert.match(
    editorSource,
    /expected_version:\s*detail\.edit_version/u
  )
  assert.match(editorSource, /items:[^\n]*values\.items/u)
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
    assert.doesNotMatch(`${pageSource}\n${editorSource}`, new RegExp(retiredName, 'u'))
  }
})

test('BOM form is mounted before open handlers initialize its form instance', async (t) => {
  assert.match(pageSource, /<BOMEditor[\s\S]*open=\{headerModalOpen\}/u)
  assert.match(editorSource, /<Form[^>]*form=\{form\}/u)
  const ui = await createReactTestHarness(t)
  const [{ Form, Input }, { createMemoryRouter, RouterProvider }, { default: Page }] = await Promise.all([
    import('antd'), import('react-router-dom'), import('../components/business-list/BusinessFormPage.jsx'),
  ])
  let form
  let openEditor
  function Editor() {
    const [open, setOpen] = useState(false)
    openEditor = setOpen
    const [instance] = Form.useForm()
    form = instance
    return h(Page, { open, form, title: 'BOM 草稿' }, h(Form, { form }, h(Form.Item, { name: 'version', label: 'BOM 版本' }, h(Input, { 'aria-label': 'BOM 版本' }))))
  }
  const router = createMemoryRouter([{ path: '*', element: h(Editor) }])
  t.after(() => router.dispose())
  await ui.render(h(RouterProvider, { router, future: { v7_startTransition: true } }))
  const field = ui.container.querySelector('input[aria-label="BOM 版本"]')
  assert.equal(Boolean(field), true, 'the actual form field is mounted while its page is closed')
  await ui.act(async () => { form.setFieldsValue({ version: 'BOM-初始化验证' }); openEditor(true) })
  assert.equal(ui.container.querySelector('input[aria-label="BOM 版本"]') === field, true)
  assert.equal(field.value, 'BOM-初始化验证')
  await ui.act(async () => openEditor(false))
  assert.equal(field.isConnected, true)
  assert.equal(form.getFieldValue('version'), 'BOM-初始化验证')
})

test('BOM copy and catalog source choices are not truncated by fixed page limits', () => {
  for (const completeReader of [
    'listAllBOMVersions',
    'listAllMaterials',
    'listAllProducts',
    'listAllUnits',
  ]) {
    assert.match(editorSource, new RegExp(completeReader, 'u'))
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
  assert.match(editorSource, /BOMMaterialGroupsForm/u)
  assert.doesNotMatch(groupForm, /label=["'](?:生产工序归属|内做外发)/u)
  assert.doesNotMatch(pageSource, /includes\([^)]*(?:面料|布料)/u)
})
