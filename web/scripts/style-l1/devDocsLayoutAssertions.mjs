import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertDevDocsDirectorySpace(page, assert) {
  const tree = page.locator('.erp-dev-docs-tree')
  await tree.waitFor()
  const geometry = await page.locator('.erp-dev-docs-page').evaluate((root) => {
    const header = root.querySelector('.erp-dev-docs-header')
    const sidebar = root.querySelector('.erp-dev-docs-sidebar')
    const shellBox = root
      .querySelector('.erp-dev-docs-shell')
      .getBoundingClientRect()
    const sidebarBox = sidebar.getBoundingClientRect()
    const readerBox = root
      .querySelector('.erp-dev-docs-reader')
      .getBoundingClientRect()
    const treeBox = sidebar
      .querySelector('.erp-dev-docs-tree')
      .getBoundingClientRect()
    const controls =
      '.erp-dev-docs-lifecycle, .erp-dev-docs-search, .erp-dev-docs-search-scope'
    return {
      headerControls: header.querySelectorAll(controls).length,
      sidebarControls: sidebar.querySelectorAll(controls).length,
      treeRatio: treeBox.height / sidebarBox.height,
      directoryTop: treeBox.top - sidebarBox.top,
      bottomDelta:
        shellBox.bottom -
        root.getBoundingClientRect().bottom +
        Number.parseFloat(getComputedStyle(root).paddingBottom),
      readerBottomDelta: sidebarBox.bottom - readerBox.bottom,
      pageOverflowsVertically:
        document.documentElement.scrollHeight > innerHeight + 1,
    }
  })
  assert.equal(
    geometry.headerControls,
    3,
    '文档层级、搜索与搜索范围应集中在页头'
  )
  assert.equal(geometry.sidebarControls, 0, '目录栏不再重复放置检索控件')
  assert(geometry.treeRatio >= 0.78, '收起置顶时，目录应占据侧栏主要高度')
  assert(geometry.directoryTop <= 110, '目录应紧接置顶和目录标题')
  assert(Math.abs(geometry.bottomDelta) <= 1, '目录与正文应填满页头之外的视口')
  assert(Math.abs(geometry.readerBottomDelta) <= 1, '目录与正文底边应对齐')
  assert.equal(
    geometry.pageOverflowsVertically,
    false,
    '页头换行后仍由目录和正文各自滚动'
  )
}

export function createDevDocsReadingFixture(keyword) {
  return [
    '# 归档全文检索探针',
    keyword,
    ...Array.from(
      { length: 20 },
      (_, index) =>
        '#'.repeat(2 + (index % 5)) +
        ' 阅读章节 ' +
        (index + 1) +
        '\n\n' +
        '示例正文，用于验证滚动定位与章节层级。'.repeat(45)
    ),
  ].join('\n\n')
}

export async function verifyDevDocsReadingNavigation(page, assert) {
  await page
    .locator('.erp-dev-docs-list__open')
    .filter({ hasText: '归档全文检索探针' })
    .click()
  await page
    .locator('.erp-dev-docs-markdown')
    .getByRole('heading', { name: '归档全文检索探针', exact: true })
    .waitFor()
  const toc = page.locator('.erp-dev-docs-toc')
  const chapters = toc.locator('[data-dev-doc-heading-id]')
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.erp-dev-docs-toc [data-dev-doc-heading-id]')
        .length === 20
  )
  assert.equal(
    await chapters.count(),
    20,
    '保留全部正文章节及深层标题，不重复列出文档标题'
  )
  assert.equal(
    await chapters.filter({ hasText: '归档全文检索探针' }).count(),
    0,
    '文档标题由回到顶部承接'
  )
  const top = page.getByRole('button', { name: '回到顶部', exact: true })
  await page.waitForFunction(
    () =>
      document
        .querySelector('.erp-dev-docs-reader__top')
        ?.getAttribute('aria-current') === 'location'
  )
  const toggle = page.locator('[data-dev-doc-toc-toggle]')
  if ((await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click()
  assert((await toc.boundingBox()).height <= 193, '全部章节在有界区域内滚动')
  const lastId = await chapters.last().getAttribute('data-dev-doc-heading-id')
  await chapters.last().click()
  await page.waitForFunction(
    (id) =>
      document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
        ?.dataset.devDocHeadingId === id,
    lastId
  )
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), lastId)

  await top.click()
  await page.waitForFunction(
    () =>
      document.querySelector('.erp-dev-docs-markdown').scrollTop <= 1 &&
      document
        .querySelector('.erp-dev-docs-reader__top')
        ?.getAttribute('aria-current') === 'location'
  )
  assert.equal(new URL(page.url()).hash, '', '回到顶部仍清理显式章节锚点')

  const firstId = await chapters.first().getAttribute('data-dev-doc-heading-id')
  await chapters.first().press('Enter')
  await page.waitForFunction(
    (id) =>
      document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
        ?.dataset.devDocHeadingId === id,
    firstId
  )
  const focus = await chapters.first().evaluate((element) => ({
    width: getComputedStyle(element).outlineWidth,
    style: getComputedStyle(element).outlineStyle,
  }))
  assert(
    Number.parseFloat(focus.width) >= 2 && focus.style !== 'none',
    '键盘定位章节应有清楚焦点'
  )
  const hashBeforeScroll = new URL(page.url()).hash
  await page
    .locator('.erp-dev-docs-markdown')
    .evaluate((element) =>
      element.scrollTo({ top: element.scrollHeight * 0.55 })
    )
  await page.waitForFunction((id) => {
    const selected = document.querySelector(
      '.erp-dev-docs-toc [aria-current="location"]'
    )
    return selected && selected.dataset.devDocHeadingId !== id
  }, firstId)
  assert.equal(
    new URL(page.url()).hash,
    hashBeforeScroll,
    '手工阅读不应生成章节浏览历史'
  )
  await toggle.click()
  const visual = await toc.evaluate((element) => {
    const selected = element.querySelector('[aria-current="location"]')
    const idle = element.querySelector('button:not([aria-current])')
    const activeStyle = getComputedStyle(selected)
    const idleStyle = getComputedStyle(idle)
    const box = selected.getBoundingClientRect()
    const frame = element.getBoundingClientRect()
    return {
      selectedCount: element.querySelectorAll('[aria-current="location"]')
        .length,
      backgroundDistinct:
        activeStyle.backgroundColor !== idleStyle.backgroundColor,
      textDistinct: activeStyle.color !== idleStyle.color,
      underline: activeStyle.boxShadow.includes('inset'),
      visible: box.left >= frame.left - 1 && box.right <= frame.right + 1,
    }
  })
  assert.equal(visual.selectedCount, 1)
  assert(
    visual.backgroundDistinct && visual.textDistinct && visual.underline,
    '当前章节以主题色、文字和下边标记共同突出'
  )
  assert(visual.visible, '收起后当前章节仍应可见')

  await page.goto(
    new URL(
      `/__dev/docs?path=${encodeURIComponent('docs/部署约定.md')}`,
      page.url()
    ).href
  )
  await page.locator('.erp-dev-docs-markdown h1').waitFor()
  await page.locator('.erp-dev-docs-toc__tag').first().waitFor()
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    await waitForFiniteAnimations(page)
    const geometry = await page
      .locator('.erp-dev-docs-reader')
      .evaluate((root) => {
        const toolbar = root.querySelector('.erp-dev-docs-reader__toolbar')
        const name = root.querySelector('.erp-dev-docs-reader__name')
        const path = root.querySelector('.erp-dev-docs-reader__path')
        const shell = root.querySelector('.erp-dev-docs-toc-shell')
        const chapter = root.querySelector('.erp-dev-docs-toc__tag')
        const toggle = root.querySelector('[data-dev-doc-toc-toggle]')
        const center = (element) => {
          const box = element.getBoundingClientRect()
          return box.top + box.height / 2
        }
        const toolbarBox = toolbar.getBoundingClientRect()
        const shellBox = shell.getBoundingClientRect()
        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          },
          toolbarHeight: toolbarBox.height,
          tocHeight: shellBox.height,
          titlePathCenterDelta: Math.abs(center(name) - center(path)),
          chapterToggleCenterDelta: Math.abs(center(chapter) - center(toggle)),
          titleHint: name.title === name.textContent,
          pathHint: path.title === path.textContent,
          fontSize: Number.parseFloat(getComputedStyle(chapter).fontSize),
          allControlsInside: [
            ...toolbar.querySelectorAll('button'),
            toggle,
          ].every((button) => {
            const box = button.getBoundingClientRect()
            const parent = toolbar.contains(button) ? toolbarBox : shellBox
            return (
              box.left >= parent.left &&
              box.right <= parent.right &&
              box.top >= parent.top &&
              box.bottom <= parent.bottom
            )
          }),
          pageOverflow:
            document.documentElement.scrollWidth > innerWidth + 1 ||
            document.documentElement.scrollHeight > innerHeight + 1,
        }
      })
    console.info(
      `[style:l1:docs-reader] width=${width} ${JSON.stringify(geometry)}`
    )
    assert(
      geometry.toolbarHeight <= (width === 1440 ? 50 : 90),
      '标题、路径和操作按可用宽度紧凑排列'
    )
    assert(geometry.tocHeight <= 46, '章节标签、导航和展开操作共用一行')
    assert(geometry.titlePathCenterDelta <= 1, '标题与路径同行对齐')
    assert(geometry.chapterToggleCenterDelta <= 1, '章节与展开操作同行对齐')
    assert(
      geometry.titleHint && geometry.pathHint,
      '截断标题和路径仍保留完整提示'
    )
    assert(
      geometry.fontSize >= 14 &&
        geometry.allControlsInside &&
        !geometry.pageOverflow,
      `压缩后保留字号、完整操作和独立滚动：${JSON.stringify(geometry)}`
    )
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}
