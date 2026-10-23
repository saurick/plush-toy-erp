import fs from 'node:fs/promises'
import { DEV_SECONDARY_NAV_ITEMS, DEV_WORKSPACE_NAV_ITEMS, DEV_VERSION_GUIDE_ROUTE } from '../../src/dev-workbench/config/devRoutes.mjs'
import { RPC_CONTRACT_REVIEW_API } from '../../src/dev-workbench/config/devRPCContractReview.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertPlainDirectory(page, selector, assert) {
  await page.locator(selector).first().waitFor()
  await page.mouse.move(0, 0)
  await waitForFiniteAnimations(page, { selector: selector.replaceAll(':visible', '') })
  const rows = await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node)
    return {
      text: node.textContent.trim(),
      current: node.matches('[aria-current]:not([aria-current="false"]), [aria-pressed="true"], .ant-anchor-link-title-active'),
      category: node.hasAttribute('aria-expanded'),
      border: ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0),
      shadow: style.boxShadow,
      background: style.backgroundColor,
      weight: style.fontWeight,
      height: node.getBoundingClientRect().height,
      fits: node.scrollWidth <= node.clientWidth + 1 || style.textOverflow === 'ellipsis',
    }
  }))
  for (const row of rows) {
    assert.equal(row.border, false, `${row.text}不应有独立卡片边框`)
    assert.equal(row.shadow, 'none', `${row.text}不应叠加阴影或选中底线`)
    assert(row.height >= 40 && row.fits, `${row.text}应有完整点击区域且文字不溢出`)
    if (!row.category) assert.equal(row.weight, row.current ? '600' : '400', `${row.text}只在当前项加粗`)
    if (!row.current) assert.equal(row.background, 'rgba(0, 0, 0, 0)', `${row.text}默认透明`)
    else assert.notEqual(row.background, 'rgba(0, 0, 0, 0)', `${row.text}选中后有浅底`)
  }
  return rows
}

function reviewFixture() {
  return {
    kind: 'plush.rpc-contract-review',
range: 'worktree',
base: 'a'.repeat(40),
    repository: { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64), dirty: true },
    current: true,
readAt: '2026-10-23T04:00:00Z',
methodCount: 2,
    changes: ['查询库存批次', '查询采购收货及关联来源的完整明细'].map((label, index) => ({
      key: index ? 'purchase_receipt.list_receipts' : 'inventory.list_inventory_lots',
      label,
kind: 'implementation',
fields: [],
consumers: [],
    })),
    checks: ['catalog', 'generated', 'staging'].map((key) => ({ key, status: 'passed', message: '目录样式夹具' })),
    files: [],
execution: { status: 'missing', current: false, methods: [], registered: [] },
  }
}

export function createDevWorkbenchDirectoryScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  return [
    {
      name: 'dev-workbench-all-page-menus',
      path: '/__dev',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installPermissionRelationshipMock(page)
        await installDatabaseMigrationFixture(page)
      },
      verify: async (page) => {
        const routes = [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS, { route: DEV_VERSION_GUIDE_ROUTE, label: '发布操作指引' }]
        const evidence = []
        for (const { route, label } of routes) {
          if (new URL(page.url()).pathname !== route) await page.goto(new URL(route, page.url()).href)
          await page.locator('h1').first().waitFor()
          if (route === '/__dev/project-skills') await page.locator('.erp-dev-skills__list > button').first().waitFor()
          if (route === '/__dev/docs') await page.locator('.erp-dev-docs-tree__doc').first().waitFor()
          const navigation = await page.locator('.erp-dev-workspace-nav').evaluateAll((nodes) => nodes.flatMap((node) => [...node.querySelectorAll('a[aria-current="page"]')].map((link) => {
            const style = getComputedStyle(link)
            return {
              text: link.textContent.trim(),
              border: ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Color`] !== 'rgba(0, 0, 0, 0)'),
              shadow: style.boxShadow,
            }
          })))
          for (const current of navigation) {
            assert.equal(current.border, false, `${label}侧栏不叠加边框`)
            assert.equal(current.shadow, 'none', `${label}侧栏不叠加底线`)
          }
          assert(navigation.length <= 1, `${label}侧栏只有一个当前位置`)
          const selector = '.erp-dev-directory-item:visible, .erp-dev-directory-anchor .ant-anchor-link-title:visible'
          const rows = await page.locator(selector).count() ? await assertPlainDirectory(page, selector, assert) : []
          await assertNoHorizontalOverflow(page, label)
          evidence.push({ route, label, title: await page.locator('h1').first().innerText(), currentNavigation: navigation, directoryRows: rows.length })
        }
        await fs.writeFile(path.join(outputDir, 'workbench-menu-page-audit.json'), JSON.stringify(evidence, null, 2))
      },
    },
    {
      name: 'dev-workbench-document-and-guide-menus',
      path: '/__dev/docs?path=docs%2FREADME.md',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const tree = '.erp-dev-docs-tree__row'
        await assertPlainDirectory(page, tree, assert)
        const folder = page.locator('[data-dev-doc-dir="docs"]')
        await folder.press('Enter')
        assert.equal(await folder.getAttribute('aria-expanded'), 'false')
        await folder.press('Enter')
        assert.equal(await folder.getAttribute('aria-expanded'), 'true')
        const search = page.getByRole('textbox', { name: '搜索项目文档' })
        await search.fill('工作台')
        await search.press('Enter')
        const result = page.locator('.erp-dev-docs-list__open').first()
        await result.waitFor()
        await result.click()
        await page.locator('.erp-dev-docs-list__open[aria-current="true"]').waitFor()
        await assertPlainDirectory(page, '.erp-dev-docs-list__open', assert)
        const pin = page.locator('.erp-dev-docs-reader__toolbar').getByRole('button', { name: '置顶文档', exact: true })
        if (await pin.count()) await pin.click()
        await page.locator('.erp-dev-docs-pinned-disclosure > summary').click()
        await assertPlainDirectory(page, '.erp-dev-docs-pinned__open', assert)
        const toc = page.locator('.erp-dev-docs-toc')
        const toggle = page.locator('[data-dev-doc-toc-toggle]')
        if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
        const chapter = toc.getByRole('button').nth(1)
        const chapterID = await chapter.getAttribute('data-dev-doc-heading-id')
        await chapter.press('Enter')
        await page.waitForFunction((id) => document.querySelector('.erp-dev-docs-toc [aria-current="location"]')?.dataset.devDocHeadingId === id, chapterID)
        assert.equal(await chapter.evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
        await assertPlainDirectory(page, '.erp-dev-docs-toc__tag', assert)
        await page.locator('.erp-dev-docs-sidebar__section--results .erp-dev-docs-sidebar__section-head').click()
        await page.screenshot({ path: path.join(outputDir, 'documents-directory.png') })
        const url = page.url()
        await page.reload()
        await page.locator('.erp-dev-docs-toc [aria-current="location"]').waitFor()
        assert.equal(page.url(), url, '刷新恢复文档、检索条件与章节')
        await page.setViewportSize({ width: 1280, height: 800 })
        await assertPlainDirectory(page, '.erp-dev-docs-list__open, .erp-dev-docs-toc__tag', assert)
        await assertNoHorizontalOverflow(page)

        await page.goto(new URL(DEV_VERSION_GUIDE_ROUTE, page.url()).href)
        const guide = page.getByRole('navigation', { name: '操作指引章节目录' })
        const anchor = guide.getByRole('link', { name: '四处操作各管什么', exact: true })
        await anchor.click()
        await guide.locator('.ant-anchor-link-title-active').filter({ hasText: '四处操作各管什么' }).waitFor()
        await assertPlainDirectory(page, '.erp-dev-directory-anchor .ant-anchor-link-title', assert)
        const { hash } = new URL(page.url())
        await page.reload()
        await guide.locator('.ant-anchor-link-title-active').filter({ hasText: '四处操作各管什么' }).waitFor()
        assert.equal(new URL(page.url()).hash, hash)
        await anchor.press('Tab')
        await waitForFiniteAnimations(page, { selector: '.erp-dev-directory-anchor' })
        assert.equal(await guide.locator('a:focus-visible').evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-workbench-flow-and-contract-menus',
      path: '/__dev/status-flows?view=states',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route(`**${RPC_CONTRACT_REVIEW_API}?*`, (route) => route.fulfill({ json: reviewFixture() }))
        await page.route('**/rpc/workflow', (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'list_tasks') return route.fallback()
          const tasks = ['样例任务甲', '样例任务乙与较长的来源说明'].map((task_name, index) => ({
            id: 901 + index,
task_name,
task_code: `DEMO-MENU-${index}`,
source_no: `DEMO-SOURCE-${index}`,
            task_status_key: 'ready',
owner_role_key: 'sales',
          }))
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: styleRpcResult({ tasks, total: tasks.length, limit: body.params.limit, offset: body.params.offset }) } })
        })
      },
      verify: async (page) => {
        const states = page.locator('.erp-dev-flow-state-list button')
        await states.first().click()
        await page.waitForFunction(() => document.querySelector('.erp-dev-flow-state-list [aria-pressed="true"]'))
        await assertPlainDirectory(page, '.erp-dev-flow-state-list button', assert)
        await page.reload()
        await page.locator('.erp-dev-flow-state-list [aria-pressed="true"]').waitFor()
        await states.first().click()
        await page.waitForFunction(() => !document.querySelector('.erp-dev-flow-state-list [aria-pressed="true"]'))
        await page.getByRole('button', { name: '搜索定义', exact: true }).click()
        const searchPanel = page.getByRole('dialog', { name: '搜索定义' })
        const search = searchPanel.getByRole('textbox')
        await search.fill('销售')
        await search.press('Enter')
        await assertPlainDirectory(page, '.erp-dev-flow-search-groups button', assert)
        await page.locator('.erp-dev-flow-search-groups button').first().click()
        await searchPanel.waitFor({ state: 'hidden' })

        await page.goto(new URL('/__dev/status-flows?view=chain&chain=all&flow_tab=exceptions', page.url()).href)
        const exceptions = page.locator('.erp-dev-exception-directory__list button')
        await exceptions.first().click()
        const key = await exceptions.first().getAttribute('data-exception-entry')
        await page.locator(`.erp-dev-exception-directory__list [data-exception-entry="${key}"][aria-pressed="true"]`).waitFor()
        await assertPlainDirectory(page, '.erp-dev-exception-directory__list button', assert)
        await page.reload()
        await page.locator(`.erp-dev-exception-directory__list [data-exception-entry="${key}"][aria-pressed="true"]`).waitFor()
        await page.setViewportSize({ width: 1280, height: 800 })
        await assertPlainDirectory(page, '.erp-dev-exception-directory__list button', assert)
        await assertNoHorizontalOverflow(page)

        await page.getByRole('tab', { name: '实例跟踪', exact: true }).click()
        await page.locator('#dev-flow-task-search').fill('样例任务')
        await page.locator('.erp-dev-flow-task-finder').getByRole('button', { name: '搜索', exact: true }).click()
        await assertPlainDirectory(page, '.erp-dev-flow-task-results li button', assert)
        assert.equal(await page.locator('.erp-dev-flow-task-results li button').count(), 2)

        await page.goto(new URL('/__dev/integration?view=changes', page.url()).href)
        const methods = page.locator('.erp-dev-rpc-review__method')
        await methods.nth(1).click()
        await methods.nth(1).filter({ hasText: '查询采购收货' }).waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.erp-dev-rpc-review__method')[1]?.getAttribute('aria-pressed') === 'true')
        await assertPlainDirectory(page, '.erp-dev-rpc-review__method', assert)
        const url = page.url()
        await page.reload()
        await page.locator('.erp-dev-rpc-review__method[aria-pressed="true"]').filter({ hasText: '查询采购收货' }).waitFor()
        assert.equal(page.url(), url)
        await assertPlainDirectory(page, '.erp-dev-rpc-review__method', assert)
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
