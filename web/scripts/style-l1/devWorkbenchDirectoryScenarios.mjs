import fs from 'node:fs/promises'
import { DEV_SECONDARY_NAV_ITEMS, DEV_WORKSPACE_NAV_ITEMS, DEV_VERSION_GUIDE_ROUTE } from '../../src/dev-workbench/config/devRoutes.mjs'
import { RPC_CONTRACT_REVIEW_API } from '../../src/dev-workbench/config/devRPCContractReview.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyDevDocsSidebarResize } from './devDocsLayoutAssertions.mjs'

export async function assertPlainDirectory(page, selector, assert) {
  await page.locator(selector).first().waitFor()
  await page.mouse.move(0, 0)
  await waitForFiniteAnimations(page, { selector: selector.replaceAll(':visible', '') })
  const rows = await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node)
    const decoration = ['::before', '::after'].some((selector) => {
      const pseudo = getComputedStyle(node, selector)
      return !['none', 'normal'].includes(pseudo.content) && pseudo.display !== 'none' &&
        pseudo.visibility !== 'hidden' && (
          pseudo.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          pseudo.backgroundImage !== 'none' ||
          pseudo.boxShadow !== 'none'
        )
    })
    return {
      text: node.textContent.trim(),
      current: node.matches('[aria-current]:not([aria-current="false"]), [aria-pressed="true"]'),
      category: node.hasAttribute('aria-expanded'),
      border: ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0),
      shadow: style.boxShadow,
      decoration,
      background: style.backgroundColor,
      weight: style.fontWeight,
      height: node.getBoundingClientRect().height,
      fits: node.scrollWidth <= node.clientWidth + 1 || style.textOverflow === 'ellipsis',
    }
  }))
  for (const row of rows) {
    assert.equal(row.border, false, `${row.text}不应有独立卡片边框`)
    assert.equal(row.shadow, 'none', `${row.text}不应叠加阴影或选中底线`)
    assert.equal(row.decoration, false, `${row.text}不应叠加目录条目的装饰底色或短标记`)
    assert(row.height >= 40 && row.fits, `${row.text}应有完整点击区域且文字不溢出`)
    if (!row.category) assert.equal(row.weight, row.current ? '600' : '400', `${row.text}只在当前项加粗`)
    if (!row.current) assert.equal(row.background, 'rgba(0, 0, 0, 0)', `${row.text}默认透明`)
    else assert.notEqual(row.background, 'rgba(0, 0, 0, 0)', `${row.text}选中后有浅底`)
  }
  return rows
}

export async function assertStaticDirectoryBranches(page, titleSelector, assert) {
  const headings = page.locator(titleSelector)
  await headings.first().waitFor()
  const groups = await headings.evaluateAll((nodes) => nodes.map((heading) => {
    const branch = heading.nextElementSibling
    const row = heading.parentElement.querySelector('.erp-directory-item')
    const headingStart = heading.getBoundingClientRect().left + parseFloat(getComputedStyle(heading).paddingInlineStart)
    return {
      title: heading.textContent.trim(),
      horizontalRule: getComputedStyle(heading, '::after').content !== 'none',
      hasItems: Boolean(row),
      sharedBranch: branch?.matches('.erp-directory-branch'),
      guideWidth: branch ? parseFloat(getComputedStyle(branch).borderInlineStartWidth) : 0,
      indent: row ? row.firstElementChild.getBoundingClientRect().left - headingStart : 0,
    }
  }))
  assert(groups.some((group) => group.hasItems), '目录应显示至少一个有条目的分组')
  for (const group of groups) {
    assert.equal(group.horizontalRule, false, `${group.title}使用竖向层级线`)
    if (!group.hasItems) continue
    assert.equal(group.sharedBranch, true, `${group.title}使用共用分支`)
    assert.equal(group.guideWidth, 1, `${group.title}下的层级线应为 1px`)
    assert(Math.abs(group.indent - 16) <= 1, `${group.title}的子项应缩进 16px，实测 ${group.indent}px`)
  }
}

async function assertDevDocsTreeHierarchy(tree, assert) {
  const layout = await tree.evaluate((element) => {
    const titleStart = (node) => node.querySelector('.erp-dev-docs-tree__name, .erp-dev-docs-tree__doc-title').getBoundingClientRect().left
    const branches = [...element.querySelectorAll('.erp-directory-branch')].map((group) => {
      const folder = group.previousElementSibling
      const childStarts = [...group.children].map(titleStart)
      return {
        path: folder.dataset.devDocDir,
        indent: Math.min(...childStarts) - titleStart(folder),
        spread: Math.max(...childStarts) - Math.min(...childStarts),
        guideWidth: Number.parseFloat(getComputedStyle(group).borderInlineStartWidth),
      }
    })
    return { branches, overflows: element.scrollWidth > element.clientWidth + 1 }
  })
  assert(layout.branches.length > 0, '已展开的目录应有子项')
  for (const { path, indent, spread, guideWidth } of layout.branches) {
    assert(Math.abs(indent - 16) <= 1, `${path} 的子项标题使用统一缩进，实测 ${indent}px`)
    assert(spread <= 1, `${path} 下的同层文件与子文件夹标题应对齐，实测偏差 ${spread}px`)
    assert(guideWidth > 0, `${path} 应有标示归属的引导线`)
  }
  assert.equal(layout.overflows, false, '目录树应在栏内换行或省略长标题')
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
          if (route === '/__dev/project-skills') {
            const directory = page.getByRole('region', { name: '项目 Skill 目录', exact: true })
            await directory.locator('.erp-directory-header').getByRole('heading', { name: 'Skill 目录', exact: true }).waitFor()
            await directory.getByRole('navigation', { name: 'Skill 条目', exact: true }).getByRole('button').first().waitFor()
          }
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
          const selector = '.erp-directory-item:visible'
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
        const toc = page.getByRole('navigation', { name: '文档章节', exact: true })
        await toc.locator('.erp-directory-header').getByText('章节目录', { exact: true }).waitFor()
        assert.equal(await toc.getByRole('button', { name: /^(收起|展开)全部$/u }).count(), 0, '一级目录显示共用标题栏和章节链接')

        const tree = '.erp-dev-docs-tree__row'
        await assertPlainDirectory(page, tree, assert)
        const folder = page.locator('[data-dev-doc-dir="docs"]')
        await folder.press('Enter')
        assert.equal(await folder.getAttribute('aria-expanded'), 'false')
        await folder.press('Enter')
        assert.equal(await folder.getAttribute('aria-expanded'), 'true')
        const directory = page.locator('.erp-dev-docs-tree')
        const directoryRegion = page.getByRole('region', { name: '文档目录', exact: true })
        const viewport = page.viewportSize()
        assert.equal(await directoryRegion.getByRole('button', { name: '收起全部', exact: true }).count(), 1, '文件树默认展开')
        await assertDevDocsTreeHierarchy(directory, assert)
        await page.setViewportSize({ width: 390, height: 844 })
        await assertDevDocsTreeHierarchy(directory, assert)
        await assertNoHorizontalOverflow(page, '文档树窄屏展开')
        await page.setViewportSize(viewport)
        await directoryRegion.getByRole('button', { name: '收起全部', exact: true }).click()
        assert.equal(await directory.locator('.erp-directory-branch').count(), 0)
        await directoryRegion.getByRole('button', { name: '展开全部', exact: true }).click()
        await assertDevDocsTreeHierarchy(directory, assert)
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
        const chapter = toc.locator('[data-dev-doc-heading-id]').nth(1)
        const chapterID = await chapter.getAttribute('data-dev-doc-heading-id')
        await chapter.press('Enter')
        await page.waitForFunction((id) => document.querySelector('.erp-dev-docs-toc [aria-current="location"]')?.dataset.devDocHeadingId === id, chapterID)
        assert.equal(await chapter.evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
        await assertPlainDirectory(page, '.erp-dev-docs-toc__item', assert)
        const idleChapter = toc.locator('.erp-dev-docs-toc__item:not([aria-current])').first()
        const idleBackground = await idleChapter.evaluate((node) => getComputedStyle(node).backgroundColor)
        await idleChapter.hover()
        const hover = await idleChapter.evaluate((node) => ({
          background: getComputedStyle(node).backgroundColor,
          decoration: getComputedStyle(node.querySelector('span')).textDecorationLine,
        }))
        assert.equal(hover.decoration, 'none', '章节悬停时文字无下划线')
        assert.notEqual(hover.background, idleBackground, '章节悬停时用共享底色反馈')
        await page.locator('.erp-dev-docs-sidebar__section--results .erp-dev-docs-sidebar__section-head').click()
        await verifyDevDocsSidebarResize(page, assert)
        await page.screenshot({ path: path.join(outputDir, 'documents-directory.png') })
        const url = page.url()
        await page.reload()
        await page.locator('.erp-dev-docs-toc [aria-current="location"]').waitFor()
        assert.equal(page.url(), url, '刷新恢复文档、检索条件与章节')
        await page.setViewportSize({ width: 1280, height: 800 })
        await assertPlainDirectory(page, '.erp-dev-docs-list__open, .erp-dev-docs-toc__item', assert)
        await assertNoHorizontalOverflow(page)

        await page.goto(new URL(DEV_VERSION_GUIDE_ROUTE, page.url()).href)
        const guide = page.getByRole('navigation', { name: '操作指引章节目录' })
        const collapseGuide = guide.getByRole('button', { name: '收起全部', exact: true })
        const expandGuide = guide.getByRole('button', { name: '展开全部', exact: true })
        const guideSection = guide.getByRole('link', { name: 'Job 并行、汇总与等待', exact: true })
        const guideTitle = page.locator('#dev-version-guide-ci-parallel')
        const branchLayout = await guideSection.evaluate((link) => {
          const branch = link.closest('.erp-directory-branch')
          const parentLink = branch.parentElement.querySelector(':scope > a')
          return {
            indent: link.getBoundingClientRect().left - parentLink.getBoundingClientRect().left,
            guideWidth: getComputedStyle(branch).borderInlineStartWidth,
          }
        })
        assert.deepEqual(branchLayout, { indent: 16, guideWidth: '1px' }, '操作指引目录使用同款层级线和缩进')
        await guideSection.click()
        await page.waitForURL((url) => url.hash === '#dev-version-guide-ci-parallel')
        await page.waitForFunction(() => {
          const { top } = document.getElementById('dev-version-guide-ci-parallel').getBoundingClientRect()
          return top >= 15 && top <= 17
        })
        await collapseGuide.click()
        await guide.locator('[aria-current="location"]').filter({ hasText: 'CI/CD 流程与原理' }).waitFor()
        assert.equal(await guideSection.count(), 0, '收起指引目录时隐藏下级链接')
        assert(await guideTitle.isVisible(), '收起目录后正文直接可读')
        assert.equal(new URL(page.url()).hash, '#dev-version-guide-ci-parallel', '开合目录时保持正文锚点')
        await expandGuide.press('Space')
        await guide.locator('[aria-current="location"]').filter({ hasText: 'Job 并行、汇总与等待' }).waitFor()
        await collapseGuide.click()
        await page.reload()
        await guideSection.waitFor()
        assert.equal(new URL(page.url()).hash, '#dev-version-guide-ci-parallel')

        const anchor = guide.getByRole('link', { name: '四处操作各管什么', exact: true })
        await anchor.click()
        await guide.locator('[aria-current="location"]').filter({ hasText: '四处操作各管什么' }).waitFor()
        await assertPlainDirectory(page, '.erp-dev-version-guide-toc .erp-directory-item', assert)
        const { hash } = new URL(page.url())
        await page.reload()
        await guide.locator('[aria-current="location"]').filter({ hasText: '四处操作各管什么' }).waitFor()
        assert.equal(new URL(page.url()).hash, hash)
        await anchor.press('Tab')
        await waitForFiniteAnimations(page, { selector: '.erp-dev-version-guide-toc .erp-directory-item' })
        assert.equal(await guide.locator('a:focus-visible').evaluate((node) => getComputedStyle(node).outlineWidth), '2px')
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'dev-workbench-reading-directory-states',
      path: '/__dev/product-core',
      viewport: { width: 1440, height: 900 },
      themeMode: 'light',
      beforeNavigate: async (page) => {
        await installPermissionRelationshipMock(page)
        await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({ json: { status: 'missing', report: null } }))
      },
      verify: async (page) => {
        const { origin } = new URL(page.url())
        const grouped = [
          ['/__dev/product-core', '产品能力目录'],
          ['/__dev/development-resources?view=relationships', '项目关系主题'],
          ['/__dev/development-resources?view=relationships&catalog=models', '图模型分类'],
        ]
        const flat = [
          ['/__dev/visualization', '图例类别'],
          ['/__dev/testing?view=guide', '测试指引目录'],
          ['/__dev/testing?view=coverage', '覆盖证据类型'],
          ['/__dev/data-preparation?dataProfile=full-acceptance&view=confirm&customer=yoyoosun', '业务链范围目录'],
          ['/__dev/permission-relationships?tab=details', '业务能力'],
        ]
        for (const [route, label] of [...grouped, ...flat]) {
          await page.goto(new URL(route, origin).href)
          const selector = `nav[aria-label="${label}"]`
          const directory = page.locator(selector)
          await directory.locator('.erp-directory-header').waitFor()
          await assertPlainDirectory(page, `${selector} .erp-directory-item`, assert)
          const titles = `${selector} .erp-directory-group-title`
          if (grouped.some(([, name]) => name === label)) {
            await assertStaticDirectoryBranches(page, titles, assert)
            await page.setViewportSize({ width: 390, height: 844 })
            await assertStaticDirectoryBranches(page, titles, assert)
            await assertNoHorizontalOverflow(page, label)
            await page.setViewportSize({ width: 1440, height: 900 })
          } else {
            assert.equal(await directory.getByRole('button', { name: /^(展开|收起)全部$/u }).count(), 0)
            const gap = await directory.locator('.erp-directory-list').evaluate((list) => getComputedStyle(list).rowGap)
            assert.equal(gap, '2px', `${label}使用统一条目间距`)
          }
          await assertNoHorizontalOverflow(page, label)
        }
        const capabilities = page.getByRole('navigation', { name: '业务能力', exact: true })
        const capability = capabilities.getByRole('button', { name: /项可用/u }).first()
        await capability.click()
        await capabilities.getByRole('button', { pressed: true }).waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        await assertPlainDirectory(page, 'nav[aria-label="业务能力"] .erp-directory-item', assert)
        await assertNoHorizontalOverflow(page, '权限明细')
      },
    },
    {
      name: 'dev-workbench-flow-and-contract-menus',
      path: '/__dev/business-rules?view=states',
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
        await page.getByRole('button', { name: '搜索定义', exact: true }).click()
        const searchPanel = page.getByRole('dialog', { name: '搜索定义' })
        const search = searchPanel.getByRole('textbox')
        await search.fill('销售')
        await search.press('Enter')
        await assertPlainDirectory(page, '.erp-dev-flow-search-groups button', assert)
        await assertStaticDirectoryBranches(page, '.erp-dev-flow-search-groups .erp-directory-group-title', assert)
        await page.locator('.erp-dev-flow-search-groups button').first().click()
        await searchPanel.waitFor({ state: 'hidden' })

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(new URL('/__dev/status-flows', page.url()).href)
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
