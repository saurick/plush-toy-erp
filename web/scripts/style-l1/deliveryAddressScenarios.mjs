import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const fixturePath = '/__delivery-address-fixture'
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></head><body><div id="root"></div>
<script type="module" src="/scripts/test/DeliveryAddressFixture.jsx"></script></body></html>`

async function selectCountry(page, search, label) {
  const input = page.getByRole('combobox', { name: '国家 / 地区', exact: true })
  await input.fill(search)
  await page.getByTitle(label, { exact: true }).click()
}

async function selectShenzhen(page) {
  await page.getByRole('combobox', { name: '所在地区', exact: true }).click()
  for (const name of ['广东省', '深圳市', '南山区']) {
    await page
      .locator('.ant-cascader-menu-item')
      .filter({ has: page.getByText(name, { exact: true }) })
      .click()
  }
}

export function createDeliveryAddressScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const address =
    'Example Warehouse\n42 Example Road, Suite 6\nAustin, TX 78701'
  const pages = [
    [
      'customers',
      '/erp/master/partners/customers',
      '新建客户',
      'default_delivery_address',
    ],
    [
      'sales',
      '/erp/sales/project-orders/sales-orders',
      '新建订单',
      'delivery_address',
    ],
    ['shipment', '/erp/warehouse/shipments', '新建草稿', 'delivery_address'],
  ].map(([key, path, trigger, field]) => ({
    name: `delivery-address-${key}`,
    path,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 1000 },
    verify: async (page) => {
      await page.getByRole('button', { name: trigger }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.waitFor()
      await editor.getByTitle('中国大陆', { exact: true }).waitFor()
      await selectShenzhen(page)
      const detail = editor.locator(`textarea[id$="${field}"]`)
      await detail.click()
      await detail.fill('科技园 8 号\n二楼仓库')
      const region = page.getByRole('combobox', {
        name: '所在地区',
        exact: true,
      })
      const regionBox = await region.boundingBox()
      const detailBox = await detail.boundingBox()
      assert.ok(
        regionBox && detailBox && regionBox.x < detailBox.x,
        'desktop region and detail share one row'
      )
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: `${outputDir}/delivery-address-${key}-mainland.png`,
        fullPage: true,
      })
      await selectCountry(page, 'United States', '美国')
      assert.equal(await region.count(), 0)
      assert.equal(await detail.inputValue(), '')
      await detail.fill(address)
      assert.equal(await detail.inputValue(), address)
      const overflow = await editor.evaluate(
        (node) => node.scrollWidth > node.clientWidth + 1
      )
      assert.equal(overflow, false)
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: `${outputDir}/delivery-address-${key}-international.png`,
        fullPage: true,
      })
    },
  }))

  const roundTrip = ['desktop', 'narrow'].map((size) => ({
    name: `delivery-address-roundtrip-${size}`,
    path: `${fixturePath}${size === 'narrow' ? '?theme=dark' : ''}`,
    viewport: { width: size === 'narrow' ? 390 : 1200, height: 900 },
    beforeNavigate: async (page) => {
      await page.route(`**${fixturePath}*`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: fixtureHTML.replace(
            '<html>',
            `<html data-erp-theme="${size === 'narrow' ? 'dark' : 'light'}">`
          ),
        })
      )
    },
    verify: async (page) => {
      const save = page.getByRole('button', {
        name: '保存收货信息',
        exact: true,
      })
      const result = page.getByLabel('保存结果', { exact: true })
      await selectCountry(page, '中国', '中国大陆')
      await selectShenzhen(page)
      await save.click()
      await page
        .getByText('请补充街道、门牌或仓库地址', { exact: true })
        .waitFor()
      let detail = page.locator('textarea#default_delivery_address')
      await detail.fill('科技园 8 号\n二楼仓库')
      await save.click()
      await page.waitForFunction(() =>
        document.querySelector('pre').textContent.includes('广东省深圳市南山区')
      )
      assert.equal(
        JSON.parse(await result.textContent()).default_delivery_address,
        '广东省深圳市南山区科技园 8 号\n二楼仓库'
      )
      await page.getByRole('button', { name: '清空表单', exact: true }).click()
      await page.getByRole('button', { name: '重新读回', exact: true }).click()
      assert.equal(await detail.inputValue(), '科技园 8 号\n二楼仓库')
      await selectCountry(page, 'United States', '美国')
      assert.equal(await detail.inputValue(), '')
      await page.getByLabel('收货人', { exact: true }).fill('Alex')
      await page
        .getByLabel('收货电话', { exact: true })
        .fill('+1 (512) 555-0100')
      await detail.fill(address)
      await save.click()
      await page.waitForFunction(() =>
        document.querySelector('pre').textContent.includes('Example Warehouse')
      )
      assert.equal(
        JSON.parse(await result.textContent()).default_delivery_address,
        address
      )
      await page.getByRole('button', { name: '清空表单', exact: true }).click()
      await page.getByRole('button', { name: '重新读回', exact: true }).click()
      assert.equal(await detail.inputValue(), address)
      await page
        .getByRole('button', { name: '带入销售订单', exact: true })
        .click()
      detail = page.locator('textarea#delivery_address')
      assert.equal(await detail.inputValue(), address)
      await save.click()
      await page.waitForFunction(() =>
        Object.hasOwn(
          JSON.parse(document.querySelector('pre').textContent),
          'address'
        )
      )
      assert.equal(JSON.parse(await result.textContent()).address, address)
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      assert.equal(await detail.isDisabled(), true)
      assert.equal(
        await page
          .getByRole('combobox', { name: '国家 / 地区', exact: true })
          .isDisabled(),
        true
      )
      await page.getByRole('button', { name: '切换只读', exact: true }).click()
      await page
        .getByRole('button', { name: '切换为空地址客户', exact: true })
        .click()
      assert.equal(await detail.inputValue(), '')
      assert.equal(
        await page.getByLabel('收货人', { exact: true }).inputValue(),
        ''
      )
      await selectCountry(page, '中国', '中国大陆')
      await selectShenzhen(page)
      await detail.fill('长地址'.repeat(80))
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1
        ),
        false
      )
      const partBoxes = await page
        .locator('.erp-delivery-address__part')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect()
            return { x, y, width, height }
          })
        )
      if (size === 'narrow') {
        assert.ok(
          partBoxes[1].y >= partBoxes[0].y + partBoxes[0].height,
          'narrow addresses stack without overlap'
        )
      }
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: `${outputDir}/delivery-address-roundtrip-${size}.png`,
        fullPage: true,
      })
    },
  }))
  const design = {
    name: 'delivery-address-design',
    path: '/__dev/ui-design',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await page
        .getByRole('heading', { name: 'UI 交互设计', exact: true })
        .waitFor()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('button', { name: '销售订单', exact: true }).click()
      await frame.getByRole('button', { name: '新建订单', exact: true }).click()
      const country = frame.locator('[data-delivery-country]')
      assert.equal(await country.inputValue(), '中国')
      await frame
        .locator('[data-delivery-region]')
        .selectOption('上海市浦东新区')
      await frame.locator('[data-form-field="address"]').fill('样例街 8 号')
      await country.selectOption('美国')
      assert.equal(await frame.locator('[data-delivery-region]').count(), 0)
      assert.equal(
        await frame.locator('[data-form-field="address"]').inputValue(),
        ''
      )
      await frame.locator('[data-form-field="address"]').fill(address)
      assert.equal(
        await frame.locator('[data-form-field="address"]').inputValue(),
        address
      )
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: `${outputDir}/delivery-address-design.png`,
        fullPage: true,
      })
    },
  }
  return [...pages, ...roundTrip, design]
}
