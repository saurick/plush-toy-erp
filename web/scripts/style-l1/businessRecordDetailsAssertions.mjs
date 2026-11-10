import { writeFile } from 'node:fs/promises'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertCompactShipmentFacts(page, { assert, path, outputDir, information, mobile, caseIdentity, sourceNo, note, customer }) {
  const facts = information.getByRole('region', { name: '本次业务资料', exact: true })
  await facts.locator('.mobile-task-facts__identity').waitFor()
  const labels = await facts.locator('.mobile-task-facts__grid dt').allTextContents()
  assert.deepEqual(labels.slice(0, 5), ['来源单据', '客户', '总净重（克）', '财务审批', '备注'])
  assert.equal(labels.includes('明细行'), false)
  assert.match(await facts.locator('.mobile-task-facts__identity').innerText(), new RegExp(sourceNo, 'u'))
  assert.equal((await facts.locator('.mobile-task-facts__state dd').innerText()).trim(), '草稿')
  assert.match(await facts.innerText(), /待确认/u)
  assert.equal(await facts.locator('[data-field-key="note"] dd').innerText(), note)
  assert.ok((await facts.innerText()).includes(customer))
  if (mobile) {
    const titleMargin = await information.getByRole('region', { name: '出货明细', exact: true }).locator('h3').evaluate((node) => Number.parseFloat(getComputedStyle(node).marginBottom))
    assert.equal(titleMargin, 12, '相邻出货明细沿用原有标题间距')
  }
  const measure = () => facts.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const fields = [...node.querySelectorAll('.mobile-task-facts__grid > div')]
    return {
      width: box.width,
      height: box.height,
      viewport: innerWidth,
      columns: getComputedStyle(node.querySelector('.mobile-task-facts__grid')).gridTemplateColumns.split(' ').length,
      firstFieldDisplay: getComputedStyle(fields[0]).display,
      overflow: node.scrollWidth - node.clientWidth,
      clippedFields: [...node.querySelectorAll('dd')].filter((field) => field.scrollWidth > field.clientWidth + 1).length,
      labels: [...node.querySelectorAll('dt')].map((field) => field.textContent),
    }
  })
  const geometry = await measure()
  assert.equal(geometry.columns, 2)
  assert.equal(geometry.firstFieldDisplay, mobile ? 'block' : 'grid')
  assert.ok(geometry.overflow <= 1 && geometry.clippedFields === 0, JSON.stringify(geometry))
  await assertTaskCopy(page, facts.getByRole('button', { name: '复制来源单据', exact: true }), 'SO-STYLE-L1', { keyboard: true })
  const gallery = facts.locator('.erp-product-gallery__trigger')
  assert.match(await gallery.innerText(), /共 18 款产品/u)
  await gallery.click()
  const products = page.getByRole('group', { name: '切换产品', exact: true })
  await products.waitFor()
  assert.equal(await products.getByRole('button').count(), 18)
  await products.getByRole('button').last().click()
  assert.equal(await products.getByRole('button').last().getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
  await page.locator('.erp-task-image-preview__stage').waitFor({ state: 'detached' })
  assert.equal(await gallery.evaluate((node) => node === document.activeElement), true)
  await facts.screenshot({ path: path.join(outputDir, `shipment-facts-${mobile ? 'mobile' : 'desktop'}-${caseIdentity}-card.png`) })
  let narrow = null
  if (mobile) {
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: 320, height: 568 })
    await waitForFiniteAnimations(page)
    narrow = await measure()
    assert.ok(narrow.overflow <= 1 && narrow.clippedFields === 0, JSON.stringify(narrow))
    await page.screenshot({ path: path.join(outputDir, `shipment-facts-mobile-${caseIdentity}-320.png`) })
    await page.setViewportSize(viewport)
  }
  await writeFile(path.join(outputDir, `shipment-facts-${mobile ? 'mobile' : 'desktop'}-${caseIdentity}.json`), JSON.stringify({ geometry, narrow }, null, 2))
}
