import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  assertVisibleBusinessFormControlHeight,
  assertVisibleRoundedInputWrapperClipping,
} from './inputControlAssertions.mjs'

test('select containers leave rounded panels unobscured in business forms and portals', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const css = await Promise.all(['control-foundation.css', 'business-modals.css']
    .map((file) => readFile(new URL(`../../src/erp/styles/app/${file}`, import.meta.url), 'utf8')))
  const controls = `
    <div class="ant-select ant-select-single"><div class="ant-select-selector">含税价</div></div>
    <div class="ant-select ant-select-multiple"><div class="ant-select-selector">多选</div></div>
    <div class="ant-select ant-select-disabled"><div class="ant-select-selector">禁用值</div></div>
    <div class="ant-select ant-select-status-error"><div class="ant-select-selector">错误值</div></div>
    <div class="ant-select ant-select-auto-complete ant-select-customize-input"><div class="ant-select-selector"><input class="ant-input" value="自动补全"></div></div>`
  await page.setContent(`<!doctype html><style>${css.join('\n')}
    .ant-select { display: inline-block; width: 240px; min-height: 34px; }
    .ant-select-selector { min-height: 34px; border: 1px solid; }
  </style><div id="root"><form class="erp-business-action-form">${controls}</form></div>
  <div class="ant-modal"><form class="erp-business-action-form">${controls}</form></div>
  <div hidden><div class="ant-select" style="background: white">隐藏选择框</div></div>
  <div class="ant-select-dropdown"><div class="ant-select" style="background: white">浮层内容</div></div>`)
  const check = () => assertVisibleRoundedInputWrapperClipping(page, '选择框背景层级')
  assert.equal(await page.locator('.ant-select-selector').count(), 10)
  await check()
  const control = page.locator('#root .ant-select-single')
  for (const paint of [
    'background: white',
    'background: rgb(255 255 255 / 20%)',
    'background-image: linear-gradient(white, white)',
    'box-shadow: inset 0 1px 0 rgb(15 23 42 / 2%)',
  ]) {
    await control.evaluate((node, value) => { node.style.cssText = value }, paint)
    await assert.rejects(check(), /select-container-paint/u)
    await control.evaluate((node) => { node.style.cssText = '' })
  }
  await check()
})

test('form height checks accept complete wrapped references and reject clipping or arbitrary size drift', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><style>
    * { box-sizing: border-box; }
    .erp-business-action-form { --erp-control-height: 34px; width: 240px; font: 14px/1.4 sans-serif; }
    input.ant-input { height: 34px; }
    .ant-select-single { width: 180px; height: auto; min-height: 34px; }
    .ant-select-selector { min-height: 34px; padding: 6.2px 8px; border: 1px solid; }
    .app-select__reference-name { display: block; white-space: normal; overflow-wrap: anywhere; }
  </style><form class="erp-business-action-form">
    <input class="ant-input" aria-label="普通字段">
    <div class="ant-select-single app-select--reference"><div class="ant-select-selector"><span class="app-select__reference-name">用于检查自然换行与完整展示的长材料名称，包含颜色、规格以及包装要求。</span></div></div>
  </form>`)
  const check = () => assertVisibleBusinessFormControlHeight(page, '引用高度合同')
  await check()
  const input = page.locator('input')
  const control = page.locator('.app-select--reference')
  const selector = page.locator('.ant-select-selector')
  const name = page.locator('.app-select__reference-name')
  await input.evaluate((node) => { node.style.height = '54px' })
  await assert.rejects(check(), /单行输入控件高度未统一/u)
  await input.evaluate((node) => { node.style.height = '' })
  await control.evaluate((node) => { node.style.height = `${node.offsetHeight + 20}px` })
  await assert.rejects(check(), /单行输入控件高度未统一/u)
  await control.evaluate((node) => { node.style.height = '' })
  await selector.evaluate((node) => { node.style.height = '34px'; node.style.overflow = 'hidden' })
  await assert.rejects(check(), /业务引用名称未完整显示/u)
  await selector.evaluate((node) => { node.style.height = ''; node.style.overflow = '' })
  await name.evaluate((node) => { node.style.whiteSpace = 'nowrap' })
  await assert.rejects(check(), /业务引用名称未完整显示/u)
  await name.evaluate((node) => { node.style.whiteSpace = ''; node.textContent = '短材料名' })
  await control.evaluate((node) => { node.style.height = '54px' })
  await assert.rejects(check(), /单行输入控件高度未统一/u)
  await control.evaluate((node) => { node.style.height = '' })
  await check()
  await selector.evaluate((node) => { node.style.paddingBlock = '20px' })
  await assert.rejects(check(), /单行输入控件高度未统一/u)
  await selector.evaluate((node) => { node.style.paddingBlock = ''; node.style.borderWidth = '0px' })
  await name.evaluate((node) => { node.textContent = '来源锁定的长材料名称仍须完整换行，并按无边框控件的实际尺寸显示。' })
  await check()
})

test('textarea checks reject excess empty height and clipping while allowing rows, counts and readonly content', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><style>
    * { box-sizing: border-box; }
    .erp-business-action-form { --erp-control-height: 34px; font: 14px/22px sans-serif; }
    textarea { display: block; width: 200px; height: 34px; padding: 5px 8px; border: 1px solid; font: inherit; }
  </style><form class="erp-business-action-form">
    <textarea class="erp-business-textarea" style="--erp-textarea-rows: 1" aria-label="名称"></textarea>
  </form>`)
  const field = page.getByRole('textbox', { name: '名称' })
  const check = () => assertVisibleBusinessFormControlHeight(page, '文本域高度合同')
  await check()
  await field.evaluate((node) => { node.style.height = '42px'; node.style.paddingBlock = '9px' })
  await assert.rejects(check(), /文本域留白/u)
  await field.evaluate((node) => { node.style.height = ''; node.style.paddingBlock = '' })
  await field.fill('短名称')
  await check()
  await field.fill('第一行\n第二行\n第三行')
  await assert.rejects(check(), /文本域留白/u)
  await field.evaluate((node) => { node.style.height = '78px' })
  await check()
  await field.evaluate((node) => { node.disabled = true })
  await check()
  await field.evaluate((node) => { node.disabled = false; node.readOnly = true })
  await check()
  await field.evaluate((node) => {
    node.readOnly = false
    node.value = ''
    node.style.height = '56px'
    node.style.setProperty('--erp-textarea-rows', '2')
  })
  await check()
  await field.evaluate((node) => {
    const wrapper = document.createElement('span')
    wrapper.className = 'ant-input-textarea-show-count'
    node.before(wrapper)
    wrapper.append(node)
    const count = document.createElement('span')
    count.className = 'ant-input-data-count'
    count.textContent = '0 / 2000'
    wrapper.append(count)
    node.style.paddingBottom = '30px'
    node.style.height = '81px'
  })
  await check()
  await field.evaluate((node) => { node.style.paddingBottom = '5px'; node.style.height = '56px' })
  await assert.rejects(check(), /文本域留白/u)
  await field.evaluate((node) => {
    const wrapper = node.parentElement
    wrapper.querySelector('.ant-input-data-count').remove()
    wrapper.className = 'ant-input-textarea-affix-wrapper'
    wrapper.style.cssText = 'display:inline-block;border:1px solid'
    node.style.setProperty('--erp-textarea-rows', '1')
    node.style.border = '0'
    node.style.height = '32px'
  })
  await check()
  await field.evaluate((node) => { node.style.height = '42px' })
  await assert.rejects(check(), /单行输入控件高度未统一/u)
})
