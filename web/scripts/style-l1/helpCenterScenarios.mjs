import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { readFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { getBusinessPageHandbookSections } from '../../src/erp/config/businessHandbook.mjs'
import { ROLE_HELP_GUIDES } from '../../src/erp/config/roleHelpContent.mjs'
import { getRoleHelpScenarios } from '../../src/erp/config/helpScenarios.mjs'
import {
  BUSINESS_USABILITY_CATALOG,
  getBusinessHelpItem,
} from '../../src/erp/config/businessUsabilityCatalog.mjs'
import {
  getHelpScenarioPresentation,
} from '../../src/erp/config/helpScenarioPresentation.mjs'
import {
  getHelpReferenceDocuments,
  HELP_REFERENCE_PAGES,
} from '../../src/erp/config/helpManualCatalog.mjs'

async function assertHelpNavigationGeometry(page, assert) {
  await page.evaluate(()=>document.fonts.ready)
  await waitForFiniteAnimations(page)
  const metrics = await page.locator('.erp-help-center-page').evaluate((root) => {
    const tabs=root.querySelector('.erp-help-navigation-tabs'),field=root.querySelector('.erp-help-center-search'),reader=root.querySelector('.erp-help-reader'),outer=root.closest('.erp-admin-content, .mobile-business-layout__content')
    const style=getComputedStyle(field),frame=tabs.getBoundingClientRect(),header=root.querySelector('.erp-help-navigation-header'),headerBox=header.getBoundingClientRect(),outerBox=outer.getBoundingClientRect()
    return {
      tabCount:tabs.querySelectorAll('[role="tab"]').length,
      selected:tabs.querySelectorAll('[aria-selected="true"]').length,
      tabsFit:tabs.scrollWidth<=tabs.clientWidth+1,
      tabWidth:tabs.clientWidth,
      tabScrollWidth:tabs.scrollWidth,
      indicator:{width:getComputedStyle(tabs,'::before').width,transform:getComputedStyle(tabs,'::before').transform},
      allLabelsFit:[...tabs.querySelectorAll('[role="tab"]')].every(tab=>tab.scrollWidth<=tab.clientWidth+1&&tab.getBoundingClientRect().right<=frame.right+1),
      corners:[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(parseFloat),
      outerOverflow:outer.scrollHeight-outer.clientHeight,
      readerOverflow:getComputedStyle(reader).overflowY,
      headerTop:headerBox.top,
      headerBottom:headerBox.bottom,
      outerTop:outerBox.top,
      outerScrollTop:outer.scrollTop,
      desktop:matchMedia('(min-width:900px)').matches,
    }
  })
  assert(metrics.selected===1&&metrics.tabsFit&&metrics.allLabelsFit,JSON.stringify(metrics))
  assert(metrics.corners.every(radius=>radius>0),JSON.stringify(metrics))
  if(metrics.desktop)assert(metrics.outerOverflow<=1&&metrics.readerOverflow==='auto',JSON.stringify(metrics))
  else {
    assert(metrics.readerOverflow==='visible',JSON.stringify(metrics))
    if(metrics.outerScrollTop>200)assert(Math.abs(metrics.headerTop-metrics.outerTop)<=1,`顶部导航应与滚动视口上沿对齐: ${JSON.stringify(metrics)}`)
  }
}

async function selectHelpDirectoryEntry(page, name, kind='参考目录') {
  let nav=page.getByRole('navigation',{name:kind,exact:true})
  if(!await nav.isVisible())await page.getByRole('button',{name:'目录',exact:true}).click()
  const button=nav.getByRole('button',{name,exact:true,includeHidden:true})
  await button.waitFor({state:'attached'})
  if(!await button.isVisible())await button.locator('xpath=ancestor::details[1]').locator('summary').click()
  await button.click()
  if(await page.evaluate(()=>matchMedia('(max-width:899px)').matches))await page.locator('#erp-help-directory').waitFor({state:'hidden'})
}

async function downloadHelpManual(page, format='html') {
  await page.getByRole('button',{name:'下载手册',exact:true}).click()
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem',{name:format==='html'?'HTML · 离线阅读':'Markdown · 文本手册',exact:true}).click(),
  ])
  await page.locator('.ant-dropdown-menu').waitFor({state:'hidden'})
  return download
}

async function openHelpHome(page) {
  await page.getByRole('tab',{name:'操作图解',exact:true}).click()
  await page.waitForFunction(()=>['home','guide'].includes(document.querySelector('.erp-help-center-page')?.dataset.helpView))
  if(await page.getByRole('button',{name:'← 帮助首页',exact:true}).isVisible())await page.getByRole('button',{name:'← 帮助首页',exact:true}).click()
  await page.getByRole('region',{name:'帮助首页',exact:true}).waitFor()
}

async function settledScrollTop(locator) {
  return locator.evaluate(element=>new Promise((resolve,reject)=>{
    const began=performance.now()
    let previous=element.scrollTop,stable=0
    const tick=()=>{
      const current=element.scrollTop
      stable=Math.abs(current-previous)<0.1?stable+1:0
      previous=current
      if(stable>=4)resolve(current)
      else if(performance.now()-began>2000)reject(new Error('正文滚动未稳定'))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
}

async function assertHelpAnchorVisible(page, selector, assert) {
  const result=await page.locator(selector).evaluate(element=>{
    const heading=element.querySelector('h4')||element
    const reader=element.closest('.erp-help-reader'),outer=element.closest('.erp-admin-content, .mobile-business-layout__content'),desktop=matchMedia('(min-width:900px)').matches
    const scroll=desktop?reader:outer
    const frame=scroll.getBoundingClientRect(),target=heading.getBoundingClientRect()
    const top=desktop?frame.top:document.querySelector('.erp-help-navigation-header').getBoundingClientRect().bottom
    return {top:target.top,min:top,bottom:target.bottom,max:frame.bottom,atEnd:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=1,hash:decodeURIComponent(location.hash.slice(1)),id:element.id}
  })
  assert(result.hash===result.id&&result.top>=result.min-1&&result.bottom<=result.max+1&&(result.top<=result.min+52||result.atEnd),JSON.stringify(result))
}

async function verifyManualTabMotion(page, assert, reduced) {
  await page.emulateMedia({
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  await page.getByRole('tab', { name: '操作图解', exact: true }).click()
  await page.waitForTimeout(400)
  const result = await page
    .locator('.erp-help-navigation-tabs')
    .evaluate(async (group) => {
      const target = group.querySelectorAll('[role="tab"]')[1]
      const before = group.getBoundingClientRect()
      const read = () => {
        const style = getComputedStyle(group, '::before')
        return {
          x: new DOMMatrixReadOnly(
            style.transform === 'none' ? undefined : style.transform
          ).m41,
          duration: style.transitionDuration,
        }
      }
      const start = read().x
      const frames = []
      target.click()
      const began = performance.now()
      await new Promise((resolve) => {
        const tick = () => {
          frames.push(read())
          if (performance.now() - began < 550) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      const after = group.getBoundingClientRect()
      return {
        start,
        target: target.offsetLeft,
        frames,
        stable: group.isConnected,
        widthDelta: after.width - before.width,
        heightDelta: after.height - before.height,
        selected: target.getAttribute('aria-selected'),
      }
    })
  assert(result.stable && result.selected === 'true', JSON.stringify(result))
  assert(Math.abs(result.widthDelta) < 1 && Math.abs(result.heightDelta) < 1)
  assert(
    Math.abs(result.frames.at(-1).x - result.target) < 1.5,
    JSON.stringify(result)
  )
  if (reduced) {
    assert(
      result.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      )
    )
  } else {
    assert(
      result.frames.some(
        (frame) => frame.x > result.start + 2 && frame.x < result.target - 2
      ),
      JSON.stringify(result)
    )
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}

async function verifyHelpViewMotion(page, assert, reduced) {
  const selector = '.erp-help-view-switch .erp-sliding-tab-list'
  const root = page.locator(selector)
  await root.getByRole('tab', { name: '怎么做', exact: true }).click()
  await root.getByRole('tab', { name: '怎么做', exact: true, selected: true }).waitFor()
  const index = await root.getByRole('tab').evaluateAll((tabs) => tabs.findIndex((tab) => tab.textContent.trim() === '完成后'))
  assert(index >= 0, '内容导航包含目标页签')
  await verifyMobileNavigationMotion(page, assert, selector, index, reduced)
}

export function createHelpCenterScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRoleAdminProfile,
  customerRoleRuntimeSession,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const warehouseProfile = customerRoleAdminProfile(
    'warehouse',
    'style-help-warehouse'
  )
  const warehouseSession = customerRoleRuntimeSession(
    ['warehouse'],
    'style-help-warehouse'
  )
  const assertFlowFits = async (page) => {
    const boxes = await page
      .locator('.erp-help-flow__steps')
      .evaluate((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
        childrenFit: [...element.querySelectorAll('button')].every(
          (button) => button.scrollWidth <= button.clientWidth + 1
        ),
      }))
    assert(
      boxes.content <= boxes.width + 1 && boxes.childrenFit,
      JSON.stringify(boxes)
    )
    await assertNoHorizontalOverflow(page, '岗位流程与页面不应横向溢出')
  }
  const assertSelectedStepIsVisible = async (page) => {
    const colors = await page
      .locator('.erp-help-flow__steps')
      .evaluate((element) => {
        const selected = getComputedStyle(
          element.querySelector('[aria-pressed="true"]')
        )
        const other = getComputedStyle(
          element.querySelector('[aria-pressed="false"]')
        )
        return {
          selected: selected.backgroundColor,
          other: other.backgroundColor,
          selectedBorder: selected.borderTopColor,
          otherBorder: other.borderTopColor,
        }
      })
    assert.notEqual(colors.selected, colors.other, '选中步骤应有明确的背景区分')
    assert.notEqual(
      colors.selectedBorder,
      colors.otherBorder,
      '选中步骤应有明确的边框区分'
    )
  }
  const waitForPickerClosed = async (page) => {
    await page
      .locator('.ant-select-dropdown:visible')
      .waitFor({ state: 'hidden' })
  }
  const waitForHelpPopoverClosed = (page) =>
    page.waitForFunction(
      () =>
        document.querySelectorAll('.erp-business-inline-help-popover')
          .length === 0,
      null,
      { timeout: 5000 }
    )
  const verifyPopoverKeyboardLink = async (page, popover) => {
    await page.keyboard.press('Tab')
    const reference = popover.getByRole('link', {
      name: '查看完整参考词条 →',
      exact: true,
    })
    assert(
      await reference.evaluate((element) => document.activeElement === element),
      'Tab 应进入参考词条链接，说明保持打开'
    )
    await page.keyboard.press('Shift+Tab')
    assert(
      await page.evaluate(() =>
        document.activeElement?.classList.contains(
          'erp-business-inline-help-trigger'
        )
      ),
      'Shift+Tab 应返回原问号'
    )
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await waitForHelpPopoverClosed(page)
    assert(
      await page.evaluate(() =>
        document.activeElement?.classList.contains(
          'erp-business-inline-help-trigger'
        )
      ),
      '关闭说明应将焦点交回原问号'
    )
  }
  return [
    ...[1920, 1440, 1024, 390, 320].map((width) => ({
      name: `help-compact-layout-${width}`,
      path: `${width < 900 ? '/m/boss/handle/help-center' : '/erp/help-center'}?view=reference&book=operations&ref=manual:operations:overview`,
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width, height: width < 900 ? 844 : 1080 },
      deviceScaleFactor: 2,
      hasTouch: width < 900,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/admin', async (route) => {
          const request = route.request().postDataJSON()
          if (request.method !== 'help_content') { await route.fallback(); return }
          const document = { id: 'manual:operations:overview', book: 'operations', title: '使用说明', source_hash: 'a'.repeat(64), supplement: true, can_edit: true, can_publish: true }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, message: 'OK', data: { documents: [document], published: [] } } }) })
        })
      },
      verify: async (page) => {
        const root = page.locator('.erp-help-center-page')
        const article = page.locator('[data-help-reference="manual:operations:overview"]')
        await article.waitFor()
        await page.getByRole('button', { name: '维护补充与纠错', exact: true }).waitFor()
        await assertHelpNavigationGeometry(page, assert)
        const metrics = await root.evaluate((node) => {
          const box = (selector) => node.querySelector(selector).getBoundingClientRect()
          const header = box('.erp-help-navigation-header')
          const heading = box('.erp-help-article__heading h3')
          const body = box('.erp-help-project-content')
          return { headerHeight: header.height, footerHeight: box('.erp-help-chapter-footer').height, directoryWidth: box('.erp-help-sidebar').width, font: parseFloat(getComputedStyle(node.querySelector('.erp-help-project-content')).fontSize), titleGap: body.top - heading.bottom, width: node.scrollWidth, available: node.clientWidth }
        })
        assert(metrics.font >= 14 && metrics.titleGap <= 18, JSON.stringify(metrics))
        assert(metrics.width <= metrics.available + 1, JSON.stringify(metrics))
        if (width >= 900) {
          assert(metrics.headerHeight <= 60 && metrics.footerHeight <= 44, JSON.stringify(metrics))
          assert(metrics.directoryWidth >= 176 && metrics.directoryWidth <= 192, JSON.stringify(metrics))
          const before = await page.locator('.erp-help-reader').boundingBox()
          await page.getByRole('button', { name: '收起目录', exact: true }).click()
          assert.equal(await page.locator('#erp-help-directory').isVisible(), false)
          const after = await page.locator('.erp-help-reader').boundingBox()
          assert(after.width > before.width + 150)
          await page.getByRole('button', { name: '目录', exact: true }).click()
        } else {
          assert(metrics.headerHeight <= 164 && metrics.footerHeight <= 100, JSON.stringify(metrics))
          assert.equal(await page.locator('.mobile-business-layout__header').count(), 0)
          await page.getByRole('button', { name: '返回任务列表', exact: true }).waitFor()
          await page.getByRole('button', { name: '目录', exact: true }).click()
          await page.locator('#erp-help-directory').waitFor()
          assert.equal(await page.locator('#erp-help-reading-panel').isVisible(), false)
          assert.equal(await page.locator('.ant-drawer').count(), 0)
          await page.keyboard.press('Escape')
          await page.locator('#erp-help-directory').waitFor({ state: 'hidden' })
          assert(await page.getByRole('button', { name: '目录', exact: true }).evaluate((button) => document.activeElement === button))
          await selectHelpDirectoryEntry(page, '日志、Trace 与故障定位')
          await page.getByRole('heading', { name: '日志、Trace 与故障定位', exact: true }).waitFor()
          assert.equal(await page.locator('#erp-help-directory').isVisible(), false)
          await selectHelpDirectoryEntry(page, '使用说明')
        }
        const strip = await page.locator('.erp-help-navigation-tabs').elementHandle()
        await page.getByRole('tab', { name: '业务使用手册', exact: true }).click()
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        await page.getByRole('tab', { name: '技术维护与运维手册', exact: true }).click()
        await article.waitFor()
        assert(await strip.evaluate((element) => element.isConnected))
        await assertNoHorizontalOverflow(page, '紧凑帮助工具栏、目录与正文不应相互挤压')
        await page.screenshot({ path: path.join(outputDir, `help-compact-${width}.png`), fullPage: false })
      },
    })),
    ...[390, 1440].map((width) => ({
      name: `help-contribution-editor-${width}`,
      path: '/erp/help-center?view=reference&book=operations&ref=manual:operations:documentation',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width, height: width === 390 ? 844 : 1000 },
      beforeNavigate: async (page) => {
        const document = { id: 'manual:operations:documentation', book: 'operations', title: '手册、帮助与持续维护', source_hash: 'a'.repeat(64), supplement: true, can_edit: true, can_publish: true }
        await page.route('**/rpc/admin', async (route) => {
          const request = route.request().postDataJSON() || {}
          let data
          if (request.method === 'help_content') data = { documents: [document], published: [] }
          else if (request.method === 'help_chapter') data = { document, can_edit: true, can_publish: true, can_respond: true, supplement: { version: 0, published_version: 0, draft_markdown: '' }, history: [], feedback: [] }
          else { await route.fallback(); return }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, message: 'OK', data } }) })
        })
      },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: '维护补充与纠错', exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog').filter({ has: page.getByText('手册、帮助与持续维护 · 纠错与企业补充', { exact: true }) })
        await dialog.getByRole('textbox', { name: '企业补充正文', exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        const metrics = await dialog.evaluate((node) => {
          const title = node.querySelector('.ant-modal-title').getBoundingClientRect()
          const close = node.querySelector('.ant-modal-close').getBoundingClientRect()
          const heading = node.querySelector('.erp-help-contribution-heading h3').getBoundingClientRect()
          const preview = node.querySelector('.erp-help-contribution-heading button').getBoundingClientRect()
          return { titleRight: title.right, closeLeft: close.left, headingCenter: heading.top + heading.height / 2, previewCenter: preview.top + preview.height / 2, width: innerWidth, documentWidth: document.documentElement.scrollWidth, dialogWidth: node.getBoundingClientRect().width }
        })
        assert(metrics.titleRight <= metrics.closeLeft + 1, JSON.stringify(metrics))
        assert(metrics.documentWidth <= metrics.width + 1 && metrics.dialogWidth <= metrics.width, JSON.stringify(metrics))
        assert(Math.abs(metrics.headingCenter - metrics.previewCenter) <= 1, JSON.stringify(metrics))
        const input = dialog.getByRole('textbox', { name: '企业补充正文', exact: true })
        await input.fill('未保存的企业补充内容')
        assert.equal(await dialog.locator('.erp-help-contribution-state').textContent(), '未保存修改')
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('button', { name: '继续填写', exact: true }).click()
        assert.equal(await input.inputValue(), '未保存的企业补充内容')
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('button', { name: '放弃并关闭', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(await trigger.evaluate((node) => document.activeElement === node), true)
      },
    })),
    {
      name: 'help-mobile-reading-only-all-pages',
      path: '/m/boss/handle/help-center',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...new Set([
          ...customerRuntimeEffectiveSession.pages,
          ...BUSINESS_USABILITY_CATALOG.map((entry) => entry.key),
          'business-dashboard', 'permission-center', 'system-audit-logs', 'history-records', 'print-center',
        ])],
      },
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        for (const entry of BUSINESS_USABILITY_CATALOG) {
          const helpPath = `/m/boss/handle/help-center?view=reference&ref=${entry.key}`
          await page.goto(new URL(helpPath, page.url()).href)
          const article = page.locator(`[data-help-reference="${entry.key}"]`)
          await article.waitFor()
          assert.equal(new URL(page.url()).pathname, '/m/boss/handle/help-center')
          assert.equal(await article.getByRole('button', { name: '打开业务页面', exact: false }).count(), 0, entry.key)
          const scenario = article.getByRole('button', { name: '查看相关操作图解 →', exact: true })
          if (await scenario.count()) {
            await scenario.click()
            await page.locator('[data-help-scenario]').waitFor()
            assert.equal(await page.locator('[data-help-scenario] > header > .ant-btn').count(), 0, `${entry.key} 图解不提供业务跳转`)
          }
          assert.deepEqual(await page.locator('a[href]').evaluateAll((links) => links.map((link) => new URL(link.href)).filter((url) => url.pathname.startsWith('/erp/') || (/^\/m\/[^/]+\/handle\//u.test(url.pathname) && !url.pathname.endsWith('/help-center'))).map((url) => url.pathname)), [], `${entry.key} 只保留帮助阅读链接`)
          await assertNoHorizontalOverflow(page, `手机帮助 ${entry.title} 阅读不溢出`)
        }
      },
    },
    {
      name: 'help-manual-extra-page-access',
      path: '/erp/help-center?role=admin&view=reference&ref=sales-orders',
      auth: 'admin',
      adminProfile: {
        ...warehouseProfile,
        menus: [
          ...warehouseProfile.menus,
          ...customerRoleAdminProfile('sales', 'style-help-sales').menus.filter((menu) => menu.key === 'sales-orders'),
        ],
        permissions: [...warehouseProfile.permissions, ...customerRoleAdminProfile('sales', 'style-help-sales').permissions],
      },
      effectiveSession: {
        ...warehouseSession,
        pages: ['inventory', 'sales-orders'],
        actions: [...warehouseSession.actions, ...customerRoleRuntimeSession(['sales'], 'style-help-extra-page').actions],
      },
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        const article = page.locator('[data-help-reference="sales-orders"]')
        await article.waitFor()
        assert.equal(await page.locator('.erp-help-center-page').getAttribute('data-role-help-key'), 'warehouse')
        await article.getByRole('button', { name: '打开业务页面', exact: false }).waitFor()
        await article.getByRole('button', { name: '查看相关操作图解 →', exact: true }).click()
        await page.locator('[data-help-scenario="sales-orders"]').waitFor()
        const search = page.getByRole('searchbox', { name: '搜索操作图解和参考手册' })
        await search.fill('船头版')
        await page.getByRole('region', { name: '帮助搜索结果', exact: true }).getByRole('button').first().waitFor()
        await search.fill('月结')
        await page.getByText('没有找到相关说明。可尝试单据名称、字段名称，或浏览手册目录。', { exact: true }).waitFor()
        await search.clear()
        await page.getByRole('tab', { name: '业务使用手册', exact: true }).click()
        await article.waitFor()
        const download = await downloadHelpManual(page, 'markdown')
        await download.saveAs(path.join(outputDir, 'warehouse-extra-page.md'))
        const text = await readFile(path.join(outputDir, 'warehouse-extra-page.md'), 'utf8')
        assert(text.includes('<a id="sales-orders"></a>'))
        assert(!text.includes('<a id="finance-payments"></a>'))
        assert.equal(await page.getByRole('tab', { name: '技术维护与运维手册', exact: true }).count(), 0)
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(new URL('/m/warehouse/handle/master/materials', page.url()).href)
        await page.getByTestId('mobile-role-bottom-nav').waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/warehouse/tasks')
        await page.goto(new URL('/m/warehouse/handle/help-center?view=reference&ref=sales-orders', page.url()).href)
        await article.waitFor()
        assert.equal(await article.getByRole('button', { name: '打开业务页面', exact: false }).count(), 0)
        assert.equal(new URL(page.url()).pathname, '/m/warehouse/handle/help-center')
      },
    },
    {
      name: 'help-manual-mobile-role-shell',
      path: '/m/boss/tasks',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-mine').click()
        await page.getByRole('button', { name: '帮助与手册', exact: true }).click()
        await page.locator('.erp-help-center-page[data-help-shell="mobile"]').waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/boss/handle/help-center')
        assert.equal(await page.locator('.mobile-business-layout__hint').count(), 0)
        await page.getByRole('tab', { name: '管理员与实施手册', exact: true }).click()
        await selectHelpDirectoryEntry(page, '员工账号')
        const outer = page.locator('.mobile-business-layout__content')
        const article = page.locator('[data-help-reference="manual:administration:employee-accounts"]')
        await article.waitFor()
        await page.getByRole('button', { name: '本章内容', exact: true }).click()
        await page.getByRole('link', { name: '调岗、临时停用与离职注销', exact: true }).click()
        const heading = article.getByRole('heading', { name: '调岗、临时停用与离职注销', exact: true })
        const id = await heading.getAttribute('id')
        await assertHelpAnchorVisible(page, `[id="${id}"]`, assert)
        await assertHelpNavigationGeometry(page, assert)
        const saved = await settledScrollTop(outer)
        assert(saved > 200)
        await page.getByRole('button', { name: '下一章：岗位设置、数据范围与导航', exact: true }).click()
        await page.locator('[data-help-reference="manual:administration:role-settings"]').waitFor()
        assert.equal(await settledScrollTop(outer), 0, '真正的手机岗位壳翻章应回到顶部')
        await page.goBack()
        await article.waitFor()
        assert(Math.abs(await settledScrollTop(outer) - saved) < 2)
        await selectHelpDirectoryEntry(page, '基础资料与试用数据')
        await page.getByRole('link', { name: '产品档案', exact: true }).click()
        await page.locator('[data-help-reference="products"]').waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/boss/handle/help-center')
        await page.getByRole('tab', { name: '技术维护与运维手册', exact: true }).click()
        await selectHelpDirectoryEntry(page, '本地启动与重启')
        const download = await downloadHelpManual(page)
        await download.saveAs(path.join(outputDir, 'mobile-role-operations.html'))
        const html = await readFile(path.join(outputDir, 'mobile-role-operations.html'), 'utf8')
        assert(html.includes('<nav aria-label="目录">') && html.includes('make dev_restart'))
        await page.setViewportSize({ width: 334, height: 780 })
        await assertHelpNavigationGeometry(page, assert)
        await assertNoHorizontalOverflow(page, '手机岗位壳能查找、阅读和下载三册，跨册仍在手机入口')
        await page.screenshot({ path: path.join(outputDir, 'mobile-role-help.png') })
        await page.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await page.getByTestId('mobile-role-nav-mine').waitFor()
        assert.equal(await page.getByTestId('mobile-role-nav-mine').getAttribute('aria-selected'), 'true', '跨册阅读后返回原来的“我的”')
        assert.equal(new URL(page.url()).pathname, '/m/boss/tasks')
      },
    },
    {
      name: 'help-navigation-scroll-desktop-light',
      path: '/erp/help-center?role=boss&view=reference&ref=products',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width:1920, height:1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const tabs=page.getByRole('tablist',{name:'帮助内容分类',exact:true})
        const reader=page.locator('.erp-help-reader')
        const article=page.locator('[data-help-reference="products"]')
        await article.waitFor()
        assert.equal(await tabs.getByRole('tab').count(),4)
        await assertHelpNavigationGeometry(page,assert)
        const before=await tabs.boundingBox()
        await tabs.getByRole('tab',{name:'操作图解',exact:true}).click()
        await page.getByRole('region',{name:'帮助首页'}).waitFor()
        const directory=page.getByRole('navigation',{name:'办事场景',exact:true})
        assert.equal(await directory.locator('details[open]').count(),1)
        assert(await directory.locator('details').count()>=8)
        assert(await directory.getByRole('button').count()<=7)
        await tabs.getByRole('tab',{name:'业务使用手册',exact:true}).click()
        await article.waitFor()
        await reader.hover()
        await page.mouse.wheel(0,850)
        await page.waitForFunction(()=>document.querySelector('.erp-help-reader').scrollTop>400)
        const saved=await settledScrollTop(reader)
        const sidebar=page.locator('#erp-help-directory')
        for(const title of ['通用操作与岗位交接','产品工程','财务管理']) {
          const summary=sidebar.locator('summary').filter({hasText:title})
          if(!await summary.evaluate(element=>element.parentElement.open))await summary.click()
        }
        await sidebar.hover()
        await page.mouse.wheel(0,800)
        await page.waitForFunction(()=>document.querySelector('#erp-help-directory').scrollTop>30)
        await settledScrollTop(sidebar)
        assert(Math.abs(await reader.evaluate(element=>element.scrollTop)-saved)<=2,'滚动目录不能移动正文')
        assert(await page.locator('.erp-admin-content').evaluate(element=>element.scrollTop===0),'目录滚动不能叠加外层页面滚动')
        await selectHelpDirectoryEntry(page,'材料档案')
        await page.locator('[data-help-reference="materials"]').waitFor()
        assert(await reader.evaluate(element=>element.scrollTop<=1))
        await page.goBack()
        await article.waitFor()
        const restored=await settledScrollTop(reader)
        assert(Math.abs(restored-saved)<=2,`浏览器返回应恢复正文阅读位置: ${JSON.stringify({saved,restored})}`)
        assert(await sidebar.locator('[aria-current="page"]').isVisible())
        await tabs.getByRole('tab',{name:'技术维护与运维手册',exact:true}).click()
        await selectHelpDirectoryEntry(page,'本地启动与重启')
        await page.locator('[data-help-reference="manual:operations:local-development"]').waitFor()
        await tabs.getByRole('tab',{name:'管理员与实施手册',exact:true}).click()
        await tabs.getByRole('tab',{name:'技术维护与运维手册',exact:true}).click()
        await page.locator('[data-help-reference="manual:operations:local-development"]').waitFor()
        const technicalTab=tabs.getByRole('tab',{name:'技术维护与运维手册',exact:true})
        await technicalTab.focus()
        await page.keyboard.press('ArrowLeft')
        const managementTab=tabs.getByRole('tab',{name:'管理员与实施手册',exact:true})
        await page.waitForFunction(()=>document.querySelector('#erp-help-category-administration').getAttribute('aria-selected')==='true')
        assert(await managementTab.evaluate(element=>element===document.activeElement),'方向键切换后焦点应留在页签')
        await verifyManualTabMotion(page,assert,false)
        await verifyManualTabMotion(page,assert,true)
        const after=await tabs.boundingBox()
        assert(Math.abs(before.y-after.y)<=1&&Math.abs(before.height-after.height)<=1)
        await assertHelpNavigationGeometry(page,assert)
        await assertNoHorizontalOverflow(page,'单层导航、目录和正文应各在自身区域内')
        await page.screenshot({path:path.join(outputDir,'help-navigation-desktop-4k.png'),fullPage:false})
      },
    },
    {
      name: 'help-navigation-directory-mobile-dark',
      path: '/erp/help-center?role=boss&view=reference&ref=products',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width:334, height:780 },
      deviceScaleFactor: 2,
      hasTouch: true,
      verify: async(page)=>{
        const article=page.locator('[data-help-reference="products"]')
        await article.waitFor()
        await assertHelpNavigationGeometry(page,assert)
        assert((await article.boundingBox()).y<330,'手机应在首屏直接开始阅读')
        await page.getByRole('button',{name:'目录',exact:true}).click()
        const drawer=page.locator('#erp-help-directory')
        await drawer.waitFor()
        await page.waitForFunction(()=>{
          const box=document.querySelector('#erp-help-directory')?.getBoundingClientRect()
          return box&&box.x>=0&&box.right<=innerWidth
        })
        await waitForFiniteAnimations(page)
        const box=await drawer.boundingBox()
        assert(box.x>=-1&&box.x+box.width<=335,JSON.stringify(box))
        await page.keyboard.press('Escape')
        await drawer.waitFor({state:'hidden'})
        assert(await page.getByRole('button',{name:'目录',exact:true}).evaluate(element=>element===document.activeElement))
        await selectHelpDirectoryEntry(page,'材料档案')
        const material=page.locator('[data-help-reference="materials"]')
        await material.waitFor()
        assert(await material.getByRole('heading',{name:'材料档案',exact:true}).evaluate(element=>element===document.activeElement))
        const main=page.locator('.erp-admin-content')
        await main.hover()
        await page.mouse.wheel(0,900)
        await page.waitForFunction(()=>document.querySelector('.erp-admin-content').scrollTop>400)
        const savedMaterialScroll = await settledScrollTop(main)
        assert(await page.locator('.erp-help-reader').evaluate(element=>element.scrollTop===0))
        await page.getByRole('button',{name:'目录',exact:true}).click()
        const selected=page.getByRole('navigation',{name:'参考目录',exact:true}).locator('[aria-current="page"]')
        assert(await selected.isVisible())
        await selectHelpDirectoryEntry(page,'产品档案')
        await article.waitFor()
        assert(await main.evaluate(element=>element.scrollTop<=1))
        await page.goBack()
        await material.waitFor()
        assert(Math.abs(await settledScrollTop(main) - savedMaterialScroll) < 2, '目录跳章后返回应恢复原正文滚动，不能保存目录滚动')
        await page.goForward()
        await article.waitFor()
        const contents=article.getByRole('navigation',{name:'本章内容',exact:true})
        await contents.getByRole('button',{name:'本章内容',exact:true}).click()
        await contents.getByRole('link',{name:'逐项填写与核对',exact:true}).click()
        await assertHelpAnchorVisible(page,'#handbook-products-fields',assert)
        await assertHelpNavigationGeometry(page,assert)
        const download=await downloadHelpManual(page,'markdown')
        assert.equal(download.suggestedFilename(),'业务使用手册.md')
        await download.saveAs(path.join(outputDir,'business-mobile.md'))
        await assertNoHorizontalOverflow(page,'手机只保留正文滚动，目录关闭后定位到所选章节')
        await page.screenshot({path:path.join(outputDir,'help-navigation-mobile-dark.png'),fullPage:false})
      },
    },
    {
      name: 'help-center-home-export-desktop-light',
      path: '/erp/help-center?role=warehouse',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const home = page.getByRole('region', { name: '帮助首页' })
        await home.waitFor()
        assert.equal(await page.locator('#erp-help-directory').isVisible(), true)
        const guide = ROLE_HELP_GUIDES.find(guide => guide.key === 'warehouse')
        assert.equal(await home.getByRole('navigation', { name: '推荐办事场景' }).getByRole('button').count(), getRoleHelpScenarios(guide).length)
        await assertNoHorizontalOverflow(page, '帮助首页不应横向溢出')
        await page.screenshot({ path: path.join(outputDir, 'help-center-home-4k.png'), fullPage: false })
        await home.getByRole('button', { name: '第一次使用，从头了解', exact: true }).click()
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        assert.equal(await page.getByRole('navigation', { name: '参考目录' }).getByRole('button', { includeHidden: true }).count(), HELP_REFERENCE_PAGES.length + 6)
        const download = await downloadHelpManual(page)
        const destination = path.join(outputDir, 'business-handbook-download.html')
        await download.saveAs(destination)
        const html = await readFile(destination, 'utf8')
        assert(html.startsWith('<!doctype html>'))
        assert(html.includes('id="engineering-material-request"'))
        assert(html.includes('id="receivables"'))
        assert(!/<script|fetch\(/u.test(html))
        await page.screenshot({ path: path.join(outputDir, 'help-center-handbook-4k.png'), fullPage: false })
        await page.getByRole('tab', { name: '操作图解', exact: true }).click()
        await home.waitFor()
      },
    },
    {
      name: 'help-manual-design-prototype',
      path: '/help-manual-design-preview',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const source = await readFile(
          new URL(
            '../../../docs/product/ui-design/index.html',
            import.meta.url
          ),
          'utf8'
        )
        const srcdoc = prepareUIDesignSandboxSource(source, { page: 'help' })
          .replaceAll('&', '&amp;')
          .replaceAll('"', '&quot;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
        await page.route('**/help-manual-design-preview', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}body{display:flex;flex-direction:column}header{font:14px system-ui;padding:12px 18px;border-bottom:1px solid #e5e7eb}iframe{display:block;width:100%;flex:1;min-height:0;border:0}</style></head><body><header>帮助手册交互稿</header><iframe title="ERP 最新可交互设计" sandbox="allow-scripts allow-downloads" srcdoc="${srcdoc}"></iframe></body></html>`,
          })
        )
      },
      verify: async (page) => {
        const root = page.frameLocator('iframe[title="ERP 最新可交互设计"]').locator('#role-help-preview')
        await root.getByRole('region', { name: '帮助首页' }).waitFor()
        const selectRole = async label => {
          await root.getByRole('combobox', { name: '推荐岗位', exact: true }).click()
          await root.getByRole('option', { name: label, exact: true }).click()
        }
        await selectRole('工程')
        await root.getByRole('navigation', { name: '推荐办事场景' }).getByRole('button', { name: /工程用料审批与采购生成/ }).click()
        await root.getByText('214.2 米', { exact: false }).first().waitFor()
        await root.getByRole('tab', { name: '业务使用手册', exact: true }).click()
        await root.getByRole('heading', { name: '开始使用', exact: true }).waitFor()
        const search = root.getByRole('searchbox', { name: '搜索操作图解和参考手册' })
        await search.fill('库存有，为什么还要采购？')
        await root.getByRole('region', { name: '帮助搜索结果' }).getByRole('button').first().click()
        await root.getByRole('heading', { name: '库存有，为什么还要采购？', exact: true }).waitFor()
        await selectRole('仓库')
        await root.getByRole('heading', { name: '库存有，为什么还要采购？', exact: true }).waitFor()
        await search.fill('月结')
        assert(await root.getByRole('region', { name: '帮助搜索结果' }).getByRole('button').count() > 0)
        await search.clear()
        await selectRole('系统管理员')
        assert.equal(await root.getByRole('navigation', { name: '参考目录' }).getByRole('button', { includeHidden:true }).count(), HELP_REFERENCE_PAGES.length + 6)
        await root.getByRole('navigation', { name:'帮助内容', exact:true }).getByRole('tab', { name:'管理员与实施手册', exact:true }).click()
        await root.getByRole('navigation', { name:'参考目录', exact:true }).getByRole('button', { name:'员工账号', exact:true }).click()
        await root.getByRole('heading', { name:'员工账号', exact:true }).waitFor()
        const contents = root.getByRole('navigation', { name:'本章内容', exact:true })
        await contents.locator('summary').click()
        await contents.getByRole('link', { name:'调岗、临时停用与离职注销', exact:true }).click()
        await root.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:'下一章：岗位设置、数据范围与导航', exact:true }).click()
        await root.getByRole('heading', { name:'岗位设置、数据范围与导航', exact:true }).waitFor()
        const [download] = await Promise.all([page.waitForEvent('download'), root.getByRole('button', { name:'下载手册', exact:true }).click()])
        assert.equal(download.suggestedFilename(), '管理员与实施手册-交互稿示例.html')
        const card = await root.locator('.article[data-reference="true"]').evaluate(element => ({border:parseFloat(getComputedStyle(element).borderLeftWidth),headingInside:element.querySelector('.page-heading')!==null}))
        assert(card.border===0&&card.headingInside, JSON.stringify(card))
        await page.setViewportSize({ width: 390, height: 844 })
        await root.getByRole('button', { name: '目录', exact: true }).click()
        assert.equal(await root.locator('.help-main').isVisible(), false)
        assert.equal(await root.locator('.manual-directory-dialog').count(), 0)
        await root.getByRole('button', { name: '返回正文', exact: true }).click()
        await root.getByRole('heading', { name: '岗位设置、数据范围与导航', exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, '帮助交互稿应留在预览容器内')
      },
    },
    {
      name: 'help-manual-engineering-desktop-light',
      path: '/erp/help-center?role=engineering&scene=engineering-material-request',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const guide = page.locator('[data-help-scenario="engineering-material-request"]')
        await guide.waitFor()
        assert.equal(await page.locator('#erp-help-directory').isVisible(), true)
        await guide.getByText('214.2 米', { exact: false }).first().waitFor()
        await guide.getByText('遇到异常', { exact: true }).click()
        await guide.locator('.erp-help-outcome-copy').getByText('新审批轮次', { exact: false }).waitFor()
        await guide.getByRole('button', { name: '返回第 1 步核对', exact: true }).click()
        assert(await guide.getByRole('button', { name: '查看步骤 1：核对用料并提交' }).evaluate(element => element === document.activeElement))
        await guide.locator('.erp-help-step-checks').getByText('怎样算办成了', { exact: true }).waitFor()
        await assertFlowFits(page)
        await verifyManualTabMotion(page, assert, false)
        await verifyManualTabMotion(page, assert, true)
        await page.getByRole('tab', { name: '操作图解', exact: true }).click()
        await openHelpHome(page)
        await page.getByRole('region', { name: '帮助首页' }).waitFor()
        const search = page.getByRole('searchbox', { name: '搜索操作图解和参考手册' })
        await search.fill('库存有，为什么还要采购？')
        const result = page.getByRole('region', { name: '帮助搜索结果' }).getByRole('button').first()
        await result.focus()
        await page.keyboard.press('Enter')
        const reference = page.locator('[data-help-reference="engineering-material-request:stock-reference"]')
        await reference.waitFor()
        assert.equal(await search.inputValue(), '')
        assert(await reference.getByRole('heading', { name: '库存有，为什么还要采购？', exact: true }).evaluate(element => element === document.activeElement))
        await page.reload()
        await reference.waitFor()
        await page.goBack()
        await page.getByRole('region', { name: '帮助搜索结果' }).waitFor()
        assert.equal(await search.inputValue(), '库存有，为什么还要采购？')
        await search.fill('不存在的帮助问题XYZ')
        await page.getByRole('button', { name: '清空搜索', exact: true }).click()
        await openHelpHome(page)
        await page.getByRole('region', { name: '帮助首页' }).waitFor()
        await page.getByRole('navigation', { name: '推荐办事场景' }).getByRole('button', { name: /工程用料审批与采购生成/ }).click()
        await guide.waitFor()
        await page.setViewportSize({ width: 1920, height: 1080 })
        await assertFlowFits(page)
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, 'help-manual-engineering-guide-4k.png'), fullPage: false })
        await page.getByRole('button', { name: '库存有，为什么还要采购？', exact: true }).click()
        await reference.waitFor()
        await assertNoHorizontalOverflow(page, '文字参考手册不应横向溢出')
        const metrics = await page.locator('.erp-help-reference-content').evaluate(element => ({width:element.clientWidth,scrollWidth:element.scrollWidth,dpr:devicePixelRatio}))
        assert(metrics.width >= 800 && metrics.scrollWidth <= metrics.width + 1 && metrics.dpr === 2, JSON.stringify(metrics))
        await page.screenshot({ path: path.join(outputDir, 'help-manual-engineering-reference-4k.png'), fullPage: false })
      },
    },
    {
      name: 'help-manual-role-filter-desktop-light',
      path: '/erp/help-center?role=engineering&view=reference&ref=engineering-material-request:stock-reference',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const reference=page.locator('[data-help-reference="engineering-material-request:stock-reference"]')
        await reference.waitFor()
        const directory=page.getByRole('navigation',{name:'参考目录',exact:true})
        assert.equal(await directory.getByRole('button',{includeHidden:true}).count(),HELP_REFERENCE_PAGES.length+6)
        await page.getByRole('tab',{name:'操作图解',exact:true}).click()
        await page.getByRole('region',{name:'帮助首页'}).waitFor()
        await page.locator('.erp-help-role-picker .ant-select-selector').click()
        await page.getByRole('option',{name:'仓库',exact:true}).click()
        await waitForPickerClosed(page)
        const expected=getRoleHelpScenarios(ROLE_HELP_GUIDES.find(g=>g.key==='warehouse'))
        assert.equal(await page.getByRole('navigation',{name:'推荐办事场景'}).getByRole('button').count(),expected.length)
        await page.getByRole('tab',{name:'业务使用手册',exact:true}).click()
        await reference.waitFor()
        assert.equal(await directory.getByRole('button',{name:'应收管理',exact:true,includeHidden:true}).count(),1)
        const search=page.getByRole('searchbox',{name:'搜索操作图解和参考手册'})
        await search.fill('月结')
        await page.getByRole('region',{name:'帮助搜索结果'}).getByRole('button').first().waitFor()
        await search.clear()
        await reference.waitFor()
        await page.setViewportSize({width:390,height:844})
        await page.reload()
        await reference.waitFor()
        assert.equal(await page.locator('#erp-help-directory').isVisible(),false)
        await page.getByRole('button',{name:'目录',exact:true}).click()
        assert.equal(await directory.getByRole('button',{includeHidden:true}).count(),HELP_REFERENCE_PAGES.length+6)
        await selectHelpDirectoryEntry(page,'开始使用')
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        await assertHelpNavigationGeometry(page,assert)
        await assertNoHorizontalOverflow(page,'手机目录沿用账号阅读范围，选中后返回正文')
        await page.screenshot({path:path.join(outputDir,'help-reading-scope-mobile.png'),fullPage:false})
      },
    },
    {
      name: 'help-project-manuals-online-download',
      path: '/erp/help-center?view=reference&book=operations&ref=manual:operations:local-development',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const books = page.getByRole('navigation', { name: '帮助内容', exact: true })
        await page.locator('[data-help-reference="manual:operations:local-development"]').waitFor()
        assert.equal(await books.getByRole('tab').count(), 4)
        for (const reduced of [false,true]) {
          await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'})
          await books.getByRole('tab',{name:'业务使用手册',exact:true}).click()
          await waitForFiniteAnimations(page)
          const motion=await books.locator('.erp-help-navigation-tabs').evaluate(async strip=>{
            const before=strip.getBoundingClientRect(),target=strip.querySelectorAll('[role="tab"]')[2]
            const read=()=>{const style=getComputedStyle(strip,'::before');return{x:new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform).m41,duration:style.transitionDuration}}
            const start=read().x,frames=[];target.click();const began=performance.now()
            await new Promise(resolve=>{const tick=()=>{frames.push(read());if(performance.now()-began<400)requestAnimationFrame(tick);else resolve()};requestAnimationFrame(tick)})
            const after=strip.getBoundingClientRect()
            return{start,frames,end:frames.at(-1).x,target:target.offsetLeft,connected:strip.isConnected,widthDelta:after.width-before.width,heightDelta:after.height-before.height}
          })
          assert(motion.connected&&Math.abs(motion.widthDelta)<1&&Math.abs(motion.heightDelta)<1&&Math.abs(motion.end-motion.target)<1.5,JSON.stringify(motion))
          if(reduced)assert(motion.frames.every(frame=>frame.duration.split(',').every(value=>parseFloat(value)===0)))
          else assert(motion.frames.some(frame=>frame.x>motion.start+1&&frame.x<motion.target-1),JSON.stringify(motion))
        }
        await page.emulateMedia({reducedMotion:'no-preference'})
        for (const [key, title, expected] of [['administration','管理员与实施手册','员工账号'],['operations','技术维护与运维手册','make dev_restart'],['business','业务使用手册','采购入库']]) {
          await books.getByRole('tab', { name: title, exact: true }).click()
          await page.locator('[data-help-reference]').waitFor()
          const download = await downloadHelpManual(page)
          assert.equal(download.suggestedFilename(), `${title}.html`)
          const destination = path.join(outputDir, `online-${key}.html`)
          await download.saveAs(destination)
          const html = await readFile(destination, 'utf8')
          assert(html.includes(expected), title)
          assert(!/<script|fetch\(/u.test(html), title)
          if(key === 'administration') {
            await page.getByRole('navigation', { name:'参考目录', exact:true }).getByRole('button', { name:'员工账号',exact:true }).click()
            await page.locator('.erp-help-project-content').getByText('调岗、临时停用与离职注销', { exact:true }).waitFor()
            const contents = page.getByRole('navigation', { name:'本章内容', exact:true })
            await contents.getByRole('button', { name:'本章内容', exact:true }).click()
            await contents.getByRole('link', { name:'调岗、临时停用与离职注销', exact:true }).click()
            const heading = page.locator('.erp-help-project-content').getByRole('heading', { name:'调岗、临时停用与离职注销', exact:true })
            const targetId=await heading.getAttribute('id')
            await assertHelpAnchorVisible(page, `[id="${targetId}"]`, assert)
            assert.equal(await contents.getByRole('button', { name:'本章内容', exact:true }).getAttribute('aria-expanded'), 'false')
            await page.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:'下一章：岗位设置、数据范围与导航', exact:true }).click()
            await page.locator('[data-help-reference="manual:administration:role-settings"]').waitFor()
            await page.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:'上一章：员工账号', exact:true }).click()
            await page.locator('[data-help-reference="manual:administration:employee-accounts"]').waitFor()
          }
        }
        await books.getByRole('tab', { name:'技术维护与运维手册',exact:true }).click()
        await page.getByRole('navigation', { name:'参考目录', exact:true }).getByRole('button', { name:'完成与交接',exact:true }).click()
        await page.locator('[data-help-reference="manual:operations:closeout"]').waitFor()
        assert.equal(await page.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:/^下一章：/u }).count(), 0)
        await page.getByRole('navigation', { name:'参考目录', exact:true }).getByRole('button', { name:'首次接手与定位',exact:true }).click()
        const article = page.locator('[data-help-reference="manual:operations:taking-over"]')
        await article.getByRole('table').waitFor()
        assert.equal(await page.getByRole('navigation',{name:'参考目录',exact:true}).locator('[aria-current="page"]').count(),1)
        await assertHelpNavigationGeometry(page, assert)
        const reader = await article.evaluate((element) => {
          const style = getComputedStyle(element)
          const heading = element.querySelector('.erp-help-article__heading')
          const body = element.querySelector('.erp-help-project-content')
          return {
            border: parseFloat(style.borderLeftWidth),
            background: style.backgroundColor,
            bodyBorder: parseFloat(getComputedStyle(body).borderLeftWidth),
            paddingDelta: Math.abs(parseFloat(getComputedStyle(heading).paddingLeft) - parseFloat(getComputedStyle(body).paddingLeft)),
          }
        })
        assert(reader.border === 0 && reader.bodyBorder === 0 && reader.paddingDelta <= 1, JSON.stringify(reader))
        await assertNoHorizontalOverflow(page,'三册手册的标题、工具栏、目录和正文应对齐')
        await page.screenshot({ path:path.join(outputDir,'three-manuals-desktop-4k.png'),fullPage:false })
        await page.reload()
        await article.waitFor()
        await page.setViewportSize({width:390,height:844})
        await page.reload()
        await article.waitFor()
        assert.equal(await books.getByRole('tab').count(),4)
        await assertHelpNavigationGeometry(page, assert)
        const textDownload = await downloadHelpManual(page, 'markdown')
        assert.equal(textDownload.suggestedFilename(),'技术维护与运维手册.md')
        await textDownload.saveAs(path.join(outputDir,'online-operations.md'))
        await assertNoHorizontalOverflow(page,'手机可阅读完整运维表格和命令，并下载当前手册')
        await page.screenshot({path:path.join(outputDir,'three-manuals-mobile.png'),fullPage:false})
        await page.setViewportSize({width:334,height:780})
        await assertHelpNavigationGeometry(page, assert)
        await assertNoHorizontalOverflow(page,'更窄手机仍能看到全部获准书目和完整下载格式')
        assert.equal(await books.getByRole('tab').count(),4)
      },
    },
    {
      name:'help-project-manuals-access-denied',
      path:'/erp/help-center?view=reference&role=admin&book=operations&ref=manual:operations:overview',
      auth:'admin',
      adminProfile:warehouseProfile,
      effectiveSession:warehouseSession,
      viewport:{width:1280,height:900},
      verify:async(page)=>{
        await page.getByRole('region',{name:'手册阅读权限',exact:true}).waitFor()
        const books=page.getByRole('navigation',{name:'帮助内容',exact:true})
        assert.equal(await books.getByRole('tab').count(),2)
        assert.equal(await page.getByRole('button',{name:'下载手册',exact:true}).count(),0)
        assert.equal(await page.locator('.erp-help-project-content').count(),0)
        await page.getByRole('searchbox',{name:'搜索操作图解和参考手册'}).fill('migrate_execute')
        await page.getByRole('region',{name:'帮助搜索结果'}).getByText('没有找到相关说明。可尝试单据名称、字段名称，或浏览手册目录。',{exact:true}).waitFor()
        await page.getByRole('button',{name:'清空搜索',exact:true}).click()
        await page.getByRole('region',{name:'手册阅读权限',exact:true}).waitFor()
        await page.getByRole('button',{name:'阅读业务使用手册',exact:true}).click()
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        await assertNoHorizontalOverflow(page,'无权手册应显示明确恢复入口')
      },
    },
    {
      name:'help-project-manuals-load-recovery',
      path:'/erp/help-center?view=reference&book=operations&ref=manual:operations:database-changes',
      auth:'admin',
      adminProfile:{is_super_admin:true},
      effectiveSession:customerRuntimeEffectiveSession,
      viewport:{width:1280,height:900},
      beforeNavigate:async(page)=>{
        let reads=0
        await page.route('**/rpc/admin',async route=>{
          const request=route.request().postDataJSON()||{}
          if(request.method!=='project_manuals'||reads++>0){await route.fallback();return}
          await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:request.id,result:{code:50000,message:'模拟读取失败'},error:''})})
        })
      },
      verify:async(page)=>{
        await page.getByRole('button',{name:'重新读取手册',exact:true}).waitFor()
        assert(page.url().includes('ref=manual%3Aoperations%3Adatabase-changes')||page.url().includes('ref=manual:operations:database-changes'))
        await page.getByRole('button',{name:'重新读取手册',exact:true}).click()
        await page.locator('[data-help-reference="manual:operations:database-changes"]').waitFor()
        assert.equal(await page.getByRole('alert').count(),0)
        await page.locator('.erp-help-project-content pre').getByText('make data',{exact:true}).waitFor()
      },
    },
    {
      name: 'help-manual-reading-layout',
      path: '/erp/help-center?role=boss&view=reference&ref=products',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const article = page.locator('[data-help-reference="products"]')
        const body = article.locator('.erp-help-handbook-sections')
        await body.getByText('产品图片与规格附件', { exact: true }).waitFor()
        const geometry = await article.evaluate((element) => {
          const rect = (selector) => element.querySelector(selector).getBoundingClientRect()
          const heading = rect('.erp-help-article__heading')
          const body = rect('.erp-help-handbook-sections')
          const first = rect('.erp-help-handbook-section')
          const contents = rect('.erp-help-handbook-anchors')
          const title = rect('.erp-help-article__heading h3')
          return { width: element.clientWidth, bodyWidth: body.width, headingGap: contents.top - heading.bottom, introGap: first.top - body.top, columnDelta: Math.abs(contents.left - body.left), titleDelta: Math.abs(title.left - first.left), duplicateIndex: element.querySelectorAll('.erp-help-reference-index').length }
        })
        assert(geometry.width >= 1200 && geometry.bodyWidth >= 1200, JSON.stringify(geometry))
        assert(geometry.headingGap <= 24 && geometry.introGap <= 26 && geometry.columnDelta <= 1 && geometry.titleDelta <= 1, JSON.stringify(geometry))
        assert.equal(geometry.duplicateIndex, 0)
        const directory = page.getByRole('navigation', { name: '参考目录' })
        assert.equal(await directory.locator('details[open]').count(), 1)
        const selected = directory.locator('[aria-current="page"]')
        assert(await selected.isVisible())
        assert(await selected.evaluate((element) => { const r = element.getBoundingClientRect(); const b = element.closest('aside').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom }))
        await assertNoHorizontalOverflow(page, '宽屏手册正文、目录及章内导航应各在本栏内')
        await page.screenshot({ path: path.join(outputDir, 'help-products-refined-4k.png'), fullPage: false })
        await article.getByRole('button', { name: '本章内容', exact: true }).click()
        await article.getByRole('link', { name: '逐项填写与核对', exact: true }).click()
        const fields = page.locator('#handbook-products-fields')
        await fields.getByText('SKU 单位与单重', { exact: true }).waitFor()
        await assertHelpAnchorVisible(page, '#handbook-products-fields', assert)
        await article.getByRole('link', { name: '单独查看：产品和规格（SKU）有什么区别', exact: true }).click()
        await page.locator('[data-help-reference="products:product-sku"]').waitFor()
        await page.goBack()
        await article.waitFor()
        await assertHelpAnchorVisible(page, '#handbook-products-fields', assert)
        await article.getByRole('link', { name: '单独查看：产品和规格（SKU）有什么区别', exact: true }).click()
        await page.locator('[data-help-reference="products:product-sku"]').waitFor()
        await page.getByRole('link', { name: '← 查看产品档案完整章节', exact: true }).click()
        await article.waitFor()
        await page.reload()
        await article.waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        await page.reload()
        await article.waitFor()
        const contents = article.getByRole('navigation', { name: '本章内容', exact: true })
        const toggle = contents.getByRole('button', { name: '本章内容', exact: true })
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        await contents.getByRole('link', { name: '逐项填写与核对', exact: true }).click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        await assertHelpAnchorVisible(page, '#handbook-products-fields', assert)
        await assertNoHorizontalOverflow(page, '手机手册可折叠导航和长字段说明不能撑破视口')
        await page.screenshot({ path: path.join(outputDir, 'help-products-refined-mobile.png'), fullPage: false })
        await page.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:'下一章：材料档案怎么用', exact:true }).click()
        await page.locator('[data-help-reference="materials"]').waitFor()
        await page.getByRole('navigation', { name:'手册章节翻页', exact:true }).getByRole('button', { name:'上一章：产品档案怎么用', exact:true }).click()
        await article.waitFor()
      },
    },
    {
      name: 'help-manual-reference-coverage-desktop-dark',
      path: '/erp/help-center?role=engineering&view=reference&ref=engineering-material-request',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1280, height: 900 },
      verify: async (page) => {
        await page.locator('[data-help-reference="engineering-material-request"]').waitFor()
        await assertHelpNavigationGeometry(page, assert)
        for (const entry of HELP_REFERENCE_PAGES) {
          const roleKey = entry.roleHelpKeys[0]
          assert(roleKey, `${entry.key}应归属于有效岗位`)
          await page.goto(
            new URL(
              `/erp/help-center?role=${roleKey}&view=reference&ref=${encodeURIComponent(entry.key)}`,
              page.url()
            ).href
          )
          const article = page.locator(`[data-help-reference="${entry.key}"]`)
          await article.getByText(entry.completion, { exact: true }).waitFor()
          await article.getByText(entry.handoff, { exact: true }).waitFor()
          assert.equal(await article.getByRole('navigation', { name: '本章内容', exact: true }).count(), 1)
          assert.equal(await article.getByRole('navigation', { name: '本章词条', exact: true }).count(), 0)
          assert.equal(await article.locator('.erp-help-handbook-anchor-link').count(), getBusinessPageHandbookSections(entry).length)
          assert.equal(await article.locator('.erp-help-handbook-term-link').count(), entry.items.length)
          for (const item of entry.items) {
            await article.getByText(item.explanation, { exact: true }).waitFor()
          }
          await assertNoHorizontalOverflow(
            page,
            `${entry.title}参考内容不应横向溢出`
          )
        }
        assert(getHelpReferenceDocuments(HELP_REFERENCE_PAGES).length > 100)
        await page.goto(new URL('/erp/help-center?role=engineering&view=reference&ref=engineering-material-request', page.url()).href)
        await page.locator('[data-help-reference="engineering-material-request"]').waitFor()
        assert.equal(await page.locator('#erp-help-directory').isVisible(), true)
        const engineeringSummary = page
          .getByRole('navigation', { name: '参考目录' })
          .locator('summary')
          .filter({ hasText: '产品工程' })
        if (
          !(await engineeringSummary.evaluate(
            (element) => element.parentElement.open
          ))
        ) {
          await engineeringSummary.click()
        }
        await page
          .getByRole('navigation', { name: '参考目录' })
          .getByRole('button', { name: '工程用料审批与采购生成', exact: true })
          .click()
        await page
          .getByRole('link', { name: '单独查看：审批冻结是什么意思', exact: true })
          .click()
        await page
          .locator(
            '[data-help-reference="engineering-material-request:frozen-sources"]'
          )
          .waitFor()
      },
    },
    {
      name: 'help-manual-context-links-mobile-dark',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: warehouseProfile,
      effectiveSession: { ...warehouseSession, pages: ['inventory'] },
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      verify: async (page) => {
        const fieldHelp = page.getByRole('button', {
          name: '查看可用量说明',
          exact: true,
        })
        await fieldHelp.scrollIntoViewIfNeeded()
        await fieldHelp.tap()
        await page
          .locator('.erp-business-inline-help-popover:visible')
          .getByRole('link', { name: '查看完整参考词条 →', exact: true })
          .click()
        await page
          .locator('[data-help-reference="inventory:available-quantity"]')
          .waitFor()
        await page.goBack()
        await page
          .getByRole('button', { name: '查看库存台账页面说明', exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '查看库存台账页面说明', exact: true })
          .click()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '查阅本页参考手册', exact: true })
          .click()
        await page.locator('[data-help-reference="inventory"]').waitFor()
        assert.equal(
          await page.locator('.erp-help-reference-content img').count(),
          0
        )
        await page
          .getByRole('link', { name: '单独查看：可用量怎么算', exact: true })
          .click()
        await page
          .locator('[data-help-reference="inventory:available-quantity"]')
          .waitFor()
        await page.getByRole('button', { name: '目录', exact: true }).click()
        await page.locator('#erp-help-directory').waitFor()
        assert.equal(await page.locator('#erp-help-reading-panel').isVisible(),false)
        await assertNoHorizontalOverflow(page,'手机目录使用同一滚动视口')
        await page.getByRole('button',{name:'返回正文',exact:true}).click()
        await page.locator('#erp-help-directory').waitFor({state:'hidden'})
        await page
          .getByRole('button', { name: '查看相关操作图解 →', exact: true })
          .click()
        await page.locator('[data-help-scenario="inventory-query"]').waitFor()
        await assertFlowFits(page)
        await page
          .getByRole('searchbox', {
            name: '搜索操作图解和参考手册',
            exact: true,
          })
          .fill('月结')
        await page
          .getByText('找到 0 条操作图解和参考说明', { exact: true })
          .waitFor()
        await page.goto(
          new URL(
            '/erp/help-center?view=reference&ref=receivables:payment-term',
            page.url()
          ).href
        )
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        assert.equal(await page.getByRole('button',{name:'打开业务页面',exact:true}).count(),0)
        await page.getByRole('tab',{name:'操作图解',exact:true}).click()
        await page.getByRole('navigation',{name:'推荐办事场景'}).getByRole('button',{name:/办理入库/}).click()
        await page
          .getByText('当前账号未开放此页面，可查看办理说明。', { exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '打开采购入库', exact: true })
            .count(),
          0
        )
        await assertNoHorizontalOverflow(page, '手机帮助恢复后不应横向溢出')
        await page.screenshot({
          path: path.join(outputDir, 'help-manual-mobile-dark.png'),
          fullPage: true,
        })
      },
    },
    {
      name: 'business-page-help-all-pages-desktop-light',
      path: BUSINESS_USABILITY_CATALOG[0].path,
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        for (const entry of BUSINESS_USABILITY_CATALOG) {
          await page.goto(new URL(entry.path, page.url()).href)
          const trigger = page.getByRole('button', {
            name: `查看${entry.title}页面说明`,
            exact: true,
          })
          await trigger.click()
          const dialog = page.getByRole('dialog', {
            name: `${entry.title}怎么用`,
            exact: true,
          })
          await dialog.getByText(entry.completion, { exact: true }).waitFor()
          await dialog.getByText(entry.handoff, { exact: true }).waitFor()
          const explanations = dialog.locator('.erp-business-page-help__item')
          assert.equal(await explanations.count(), entry.items.length)
          assert.equal(
            await dialog.locator('.erp-business-page-help__item[open]').count(),
            0
          )
          const first = explanations.first()
          await first.locator('summary').focus()
          await page.keyboard.press('Enter')
          await first
            .getByText(entry.items[0].explanation, { exact: true })
            .waitFor()
          await page.keyboard.press('Enter')
          assert.equal(await first.getAttribute('open'), null)
          await assertNoHorizontalOverflow(page, `${entry.key} 页内帮助`)
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          await page.waitForFunction(
            (name) =>
              document.activeElement?.getAttribute('aria-label') === name,
            `查看${entry.title}页面说明`
          )
        }
        // 生产记录共用页头，切到异常时不能保留成品入库说明。
        await page.goto(new URL('/erp/production/progress', page.url()).href)
        await page.getByRole('tab', { name: '异常处理', exact: true }).click()
        await page
          .getByRole('button', { name: '查看异常处理页面说明', exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '查看生产记录页面说明', exact: true })
            .count(),
          0
        )
      },
    },
    {
      name: 'business-page-help-mobile-dark',
      path: '/erp/finance/receivables',
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      verify: async (page) => {
        const trigger = page.getByRole('button', {
          name: '查看应收管理页面说明',
          exact: true,
        })
        await trigger.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog', {
          name: '应收管理怎么用',
          exact: true,
        })
        await dialog.waitFor()
        const formula = dialog
          .locator('.erp-business-page-help__item')
          .filter({ hasText: '月结和到期日期怎么算' })
        await formula.locator('summary').click()
        await formula
          .getByText(
            getBusinessHelpItem('receivables', 'payment-term').example,
            { exact: true }
          )
          .waitFor()
        await page.waitForFunction(() => {
          let element = document.querySelector(
            '.erp-business-page-help-modal[role="dialog"]'
          )
          if (!element) return false
          for (; element; element = element.parentElement) {
            if (Number(getComputedStyle(element).opacity) < 0.99) return false
          }
          return true
        })
        const geometry = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const body = element.querySelector('.ant-modal-body')
          let opaque = true
          for (let node = element; node; node = node.parentElement) {
            if (Number(getComputedStyle(node).opacity) < 0.99) opaque = false
          }
          const topElement = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          )
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            modalWidth: rect.width,
            modalHeight: rect.height,
            opaque,
            onTop: element.contains(topElement),
            scrollable: body.scrollHeight > body.clientHeight,
          }
        })
        assert(
          geometry.modalWidth > 0 &&
            geometry.modalHeight > 0 &&
            geometry.opaque &&
            geometry.onTop &&
            geometry.left >= 0 &&
            geometry.right <= geometry.width &&
            geometry.top >= 0 &&
            geometry.bottom <= geometry.height,
          JSON.stringify(geometry)
        )
        assert(geometry.scrollable, '较长帮助在弹窗内滚动，不撑出手机屏幕')
        await assertNoHorizontalOverflow(page, '手机页内帮助')
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-page-help-mobile-dark-expanded.png'
          ),
          fullPage: true,
        })
        await dialog
          .getByRole('button', { name: '我知道了', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '查看应收管理页面说明'
        )
        await trigger.click()
        await dialog.waitFor()
        await page.waitForFunction(() =>
          Boolean(
            document.activeElement?.closest('.erp-business-page-help-modal')
          )
        )
        assert.equal(
          await dialog.locator('.erp-business-page-help__item[open]').count(),
          0,
          '重新打开不残留上次展开内容'
        )
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '查看应收管理页面说明'
        )

        const inline = page.getByRole('button', {
          name: '查看账期说明',
          exact: true,
        })
        await inline.scrollIntoViewIfNeeded()
        await inline.focus()
        const popover = page.locator(
          '.erp-business-inline-help-popover:visible'
        )
        await popover.waitFor()
        await popover
          .getByText(
            getBusinessHelpItem('receivables', 'payment-term').source,
            { exact: true }
          )
          .waitFor()
        await verifyPopoverKeyboardLink(page, popover)
        const measurement = await page
          .locator('.ant-table-measure-cell-content')
          .first()
          .evaluate((element) => ({
            visibility: getComputedStyle(element).visibility,
            width: element.scrollWidth,
          }))
        assert.equal(measurement.visibility, 'hidden')
        assert(measurement.width > 0, '隐藏测量副本仍应保留真实列宽')
        const sortBefore = await inline.evaluate((element) =>
          element.closest('th')?.getAttribute('aria-sort')
        )
        await inline.tap()
        await popover.waitFor()
        assert.equal(
          await inline.evaluate((element) =>
            element.closest('th')?.getAttribute('aria-sort')
          ),
          sortBefore,
          '打开说明不能顺带改变表格排序'
        )
        await popover
          .getByText(
            getBusinessHelpItem('receivables', 'payment-term').example,
            { exact: true }
          )
          .waitFor()
        await page
          .getByRole('heading', { name: '财务管理', exact: true })
          .click()
        await waitForHelpPopoverClosed(page)
        await assertNoHorizontalOverflow(page, '手机账期问号')

        await page.goto(new URL('/erp/warehouse/inventory', page.url()).href)
        const inventoryHelp = page.getByRole('button', {
          name: '查看可用量说明',
          exact: true,
        })
        await inventoryHelp.scrollIntoViewIfNeeded()
        await inventoryHelp.focus()
        await popover.waitFor()
        const inventoryFormula = getBusinessHelpItem(
          'inventory',
          'available-quantity'
        )
        for (const text of [
          inventoryFormula.explanation,
          inventoryFormula.source,
          inventoryFormula.example,
        ]) {
          await popover.getByText(text, { exact: true }).waitFor()
        }
        await verifyPopoverKeyboardLink(page, popover)
        const inventorySortBefore = await inventoryHelp.evaluate((element) =>
          element.closest('th')?.getAttribute('aria-sort')
        )
        await page.keyboard.press('Shift+Tab')
        await inventoryHelp.focus()
        await page.keyboard.press('Enter')
        await waitForHelpPopoverClosed(page)
        await page.keyboard.press('Enter')
        await popover.waitFor()
        assert.equal(
          await inventoryHelp.evaluate((element) =>
            element.closest('th')?.getAttribute('aria-sort')
          ),
          inventorySortBefore,
          '键盘打开公式不能触发表格排序'
        )
        await verifyPopoverKeyboardLink(page, popover)
      },
    },
    {
      name: 'help-center-all-scenes-desktop-dark',
      path: '/erp/help-center?role=warehouse&scene=finished-goods',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: { is_super_admin: true },
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        let checked = 0
        for (const guide of ROLE_HELP_GUIDES) {
          for (const scenario of getRoleHelpScenarios(guide)) {
            await page.goto(new URL(`/erp/help-center?role=${guide.key}&scene=${scenario.key}`,page.url()).href)
            const article = page.locator(
              `[data-help-scenario="${scenario.key}"]`
            )
            await article.waitFor()
            const model = getHelpScenarioPresentation(scenario, guide.key)
            assert.equal(
              await article.locator('.erp-help-flow__steps button').count(),
              model.steps.length
            )
            for (const step of model.steps) {
              const button = article.getByRole('button', {
                name: `查看步骤 ${step.number}：${step.title}`,
                exact: true,
              })
              await button.click()
              assert.equal(await button.getAttribute('aria-pressed'), 'true')
              await article.locator(`[data-help-view="${step.view}"]`).waitFor()
              assert(
                await button.evaluate(
                  (element) => document.activeElement === element
                ),
                '点击节点后焦点应保留'
              )
            }
            await article.getByText('遇到异常', { exact: true }).click()
            await article
              .getByText(scenario.exception.trigger, { exact: true })
              .waitFor()
            await article
              .getByRole('button', {
                name: `返回第 ${model.exception.backNumber} 步核对`,
                exact: true,
              })
              .click()
            assert.equal(
              await article
                .getByRole('button', {
                  name: `查看步骤 ${model.exception.backNumber}：${model.steps[model.exception.backNumber - 1].title}`,
                  exact: true,
                })
                .getAttribute('aria-pressed'),
              'true'
            )
            await article.getByText('完成后', { exact: true }).click()
            await article
              .getByText(scenario.completion, { exact: true })
              .waitFor()
            await assertFlowFits(page)
            checked += 1
          }
        }
        assert.equal(
          checked,
          ROLE_HELP_GUIDES.reduce(
            (sum, guide) => sum + getRoleHelpScenarios(guide).length,
            0
          )
        )
        await openHelpHome(page)
        await page
          .locator('.erp-help-role-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .click()
        await waitForPickerClosed(page)
        await page
          .getByRole('navigation', { name: '推荐办事场景' })
          .getByRole('button', { name: /收付款与核销/ })
          .click()
        await page.screenshot({
          path: path.join(outputDir, 'help-center-finance-desktop-dark.png'),
          fullPage: true,
        })
        await openHelpHome(page)
        await page
          .locator('.erp-help-role-picker .ant-select-selector')
          .click()
        await page.locator('.ant-select-dropdown:visible').waitFor()
        await page.waitForFunction(() => {
          const popup = document.querySelector(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
          )
          return popup && getComputedStyle(popup).opacity === '1'
        })
        await page.screenshot({
          path: path.join(outputDir, 'help-center-role-select-dark.png'),
          fullPage: true,
        })
        await page.keyboard.press('Escape')
        await waitForPickerClosed(page)
      },
    },
    {
      name: 'help-center-warehouse-desktop-light',
      path: '/erp/help-center?role=warehouse&scene=finished-goods',
      auth: 'admin',
      adminProfile: warehouseProfile,
      effectiveSession: warehouseSession,
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        const article = page.locator('[data-help-scenario="finished-goods"]')
        await article.waitFor()
        assert.equal(
          await page.locator('.erp-help-role-picker').count(),
          0
        )
        const checkReceipt = article.getByRole('button', {
          name: '查看步骤 2：核对实收与批次',
        })
        await checkReceipt.click()
        assert.equal(
          await checkReceipt.getAttribute('aria-pressed'),
          'true'
        )
        const confirm = article.getByRole('button', {
          name: '查看步骤 3：确认成品入库',
        })
        await confirm.focus()
        await page.keyboard.press('Enter')
        assert.equal(await confirm.getAttribute('aria-pressed'), 'true')
        await article
          .locator('.erp-help-view-body')
          .getByText('确认后检查结果', { exact: true })
          .waitFor()
        await article.getByText('遇到异常', { exact: true }).click()
        await article
          .getByText('处理后回到同一收仓记录重新核对', { exact: false })
          .waitFor()
        await assertFlowFits(page)
        await page.getByText('怎么做', { exact: true }).click()
        await assertSelectedStepIsVisible(page)
        await article
          .getByRole('button', { name: '图解 A：找到待入库报告' })
          .click()
        assert.equal(
          await article
            .getByRole('button', { name: '查看步骤 1：登记手工成品收仓' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await article
          .getByRole('button', { name: '说明 B：核对仓库、批次与实收' })
          .click()
        assert.equal(
          await article
            .getByRole('button', { name: '图解 B：核对仓库、批次与实收' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await verifyHelpViewMotion(page, assert, false)
        await verifyHelpViewMotion(page, assert, true)
        await article.getByText('库存余额 · 示例', { exact: true }).waitFor()
        await article.getByText('340', { exact: true }).waitFor()
        await article.getByText('遇到异常', { exact: true }).click()
        await article
          .getByRole('button', { name: '返回第 2 步核对', exact: true })
          .click()
        assert(
          await article
            .getByRole('button', { name: '查看步骤 2：核对实收与批次' })
            .evaluate((element) => document.activeElement === element),
          '返回核对后焦点回到步骤'
        )

        await article.getByText('怎么做', { exact: true }).click()
        await article
          .getByRole('button', { name: '说明 B：核对仓库、批次与实收' })
          .click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: path.join(outputDir, 'help-center-warehouse-desktop.png'),
          fullPage: true,
        })
        await article.locator('.erp-help-instructions').screenshot({
          path: path.join(outputDir, 'help-center-operation-illustration.png'),
        })
        await page.setViewportSize({ width: 1100, height: 800 })
        await assertFlowFits(page)
        const branchBox = await article
          .locator('.erp-help-flow__issue button')
          .boundingBox()
        const stepsBox = await article
          .locator('.erp-help-flow__steps')
          .boundingBox()
        const stacked=await article.locator('.erp-help-flow__issue').evaluate(element=>getComputedStyle(element).position==='static')
        assert(
          branchBox.y >= stepsBox.y + stepsBox.height + (stacked ? 10 : 40),
          '异常分支不能压住换行后的步骤'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'help-center-warehouse-narrow-desktop.png'
          ),
          fullPage: true,
        })
        await page.setViewportSize({ width: 1440, height: 960 })
        await selectHelpDirectoryEntry(page,'查库存','办事场景')
        await page.waitForURL(
          (url) => url.searchParams.get('scene') === 'inventory-query'
        )
        await page.reload()
        await page.locator('[data-help-scenario="inventory-query"]').waitFor()
        await page.goBack()
        await article.waitFor()
        assert.equal(
          await article
            .getByRole('button', { name: '查看步骤 1：登记手工成品收仓' })
            .getAttribute('aria-pressed'),
          'true'
        )
        await article
          .getByRole('button', { name: '打开生产记录', exact: true })
          .click()
        await page.waitForURL(
          (url) => url.pathname === '/erp/production/progress'
        )
        await page.goBack()
        await article.waitFor()
      },
    },
    {
      name: 'help-center-no-entry-permission',
      path: '/erp/help-center?role=warehouse&scene=inbound',
      auth: 'admin',
      adminProfile: warehouseProfile,
      effectiveSession: { ...warehouseSession, pages: ['inventory'] },
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        const article = page.locator('[data-help-scenario="inbound"]')
        await article
          .getByText('当前账号未开放此页面，可查看办理说明。', { exact: true })
          .waitFor()
        assert.equal(
          await article
            .getByRole('button', { name: '打开采购入库', exact: true })
            .count(),
          0
        )
        await selectHelpDirectoryEntry(page,'查库存','办事场景')
        await page
          .locator('[data-help-scenario="inventory-query"]')
          .getByRole('button', { name: '打开库存台账', exact: true })
          .waitFor()
        await assertFlowFits(page)
      },
    },
    {
      name: 'help-center-unknown-role',
      path: '/erp/help-center?role=warehouse&role=boss&scene=finished-goods&scene=shipments',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'custom-role' }],
        permissions: [],
        menus: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['custom-role'],
        pages: [],
        actions: [],
      },
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.locator('[data-role-help-key="generic"]').waitFor()
        await page.waitForURL(
          (url) =>
            url.search === '?role=generic&scene=getting-started&view=guide'
        )
        assert.equal(
          await page.locator('.erp-help-article__heading button:not(.erp-help-back-home)').count(),
          0
        )
        assert.equal(
          await page.locator('.erp-help-role-picker').count(),
          0
        )
        await assertFlowFits(page)
        await page
          .getByRole('tab', { name: '业务使用手册', exact: true })
          .click()
        await page.locator('[data-help-reference="handbook:start"]').waitFor()
        await page
          .getByRole('tab', { name: '操作图解', exact: true })
          .click()
        await page.locator('[data-help-scenario="getting-started"]').waitFor()
      },
    },
    {
      name: 'help-center-role-switch-mobile-dark',
      path: '/erp/help-center?role=boss&scene=finished-goods',
      auth: 'admin',
      themeMode: 'dark',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'purchase' }, { role_key: 'finance' }],
      },
      effectiveSession: customerRoleRuntimeSession(
        ['purchase', 'finance'],
        'style-help-multiple'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.waitForURL(
          (url) =>
            url.searchParams.get('role') === 'purchase' &&
            url.searchParams.get('scene') === 'suppliers'
        )
        await openHelpHome(page)
        await page
          .locator('.erp-help-role-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .click()
        await waitForPickerClosed(page)
        await page.waitForURL(
          (url) =>
            url.searchParams.get('role') === 'finance' &&
            url.searchParams.get('view') === 'home'
        )
        await page.getByRole('navigation',{name:'推荐办事场景'}).getByRole('button',{name:/收付款/}).click()
        await selectHelpDirectoryEntry(page,'办理发票','办事场景')
        await page.locator('[data-help-scenario="invoices"]').waitFor()
        await page
          .getByRole('button', { name: '查看步骤 3：办理并确认结果' })
          .click()
        await page
          .locator('.erp-help-current-step')
          .getByText('实际开票结果', { exact: false })
          .waitFor()
        await page.getByText('遇到异常', { exact: true }).click()
        await assertFlowFits(page)
        await page.getByText('怎么做', { exact: true }).click()
        await assertSelectedStepIsVisible(page)
        await page.getByRole('button', { name: '目录', exact: true }).click()
        assert.equal(
          await page
            .getByRole('button', { name: '打开财务手机待办', exact: true })
            .count(),
          0,
          '未授予手机岗位权限时，帮助目录不能增加手机待办入口'
        )
        await page.locator('#erp-help-directory').waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'help-center-finance-mobile-dark.png'),
          fullPage: true,
        })
        await page.getByRole('button',{name:'返回正文',exact:true}).click()
        await page.locator('#erp-help-directory').waitFor({state:'hidden'})
        await page.locator('.erp-help-flow').scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(
            outputDir,
            'help-center-finance-mobile-flow-dark.png'
          ),
          fullPage: true,
        })
        await page.reload()
        await page.locator('[data-help-scenario="invoices"]').waitFor()
        await page.goBack()
        await page.locator('[data-help-scenario="finance-payments"]').waitFor()
        await assertFlowFits(page)
      },
    },
  ]
}
