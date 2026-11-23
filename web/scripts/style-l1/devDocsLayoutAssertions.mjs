import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function verifyDevDocsSidebarResize(page, assert) {
  const divider = page.getByRole('slider', { name: '调整文档列表宽度', exact: true })
  const sidebar = page.locator('.erp-dev-docs-sidebar')
  const reader = page.locator('.erp-dev-docs-reader')
  const currentWidth = async () => (await sidebar.boundingBox()).width
  const readerWidth = async () => (await reader.boundingBox()).width
  const gripCenter = async () => {
    const grip = await divider.boundingBox()
    return { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  }
  const initialWidth = await currentWidth()
  const initialReader = await readerWidth()
  const url = page.url()
  const viewport = page.viewportSize()
  const { x, y } = await gripCenter()

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y)
  assert.equal(await currentWidth(), initialWidth + 60, '拖动时左栏实时展开')
  assert.equal(await readerWidth(), initialReader - 60, '阅读区随拖动一起收缩')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  assert.equal(await currentWidth(), initialWidth, 'Escape 恢复拖动前的宽度')
  assert.equal(await readerWidth(), initialReader)

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 200, y, { steps: 5 })
  const draggedWidth = initialWidth + 200
  assert.equal(await currentWidth(), draggedWidth, '松手前已应用拖动宽度')
  assert.equal(Number(await divider.getAttribute('aria-valuenow')), draggedWidth)
  await page.mouse.up()
  assert.equal(await currentWidth(), draggedWidth, '松手后保持当前宽度')
  assert.equal(await readerWidth(), initialReader - 200, '两栏共享可用宽度')
  assert.equal(page.url(), url, '调宽时保持当前文档和章节')

  await divider.press('ArrowLeft')
  let preferredWidth = draggedWidth - 20
  assert.equal(await currentWidth(), preferredWidth, '聚焦分隔线后可用方向键调宽')
  for (const delta of [-0.5, 0.5, -0.5]) {
    const { x: startX, y: startY } = await gripCenter()
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + delta, startY)
    preferredWidth += delta
    assert.equal(await currentWidth(), preferredWidth, `拖动 ${delta}px 时实时调整宽度`)
    await page.mouse.up()
    assert.equal(await currentWidth(), preferredWidth, `保留 ${delta}px 的小幅拖动`)
  }
  await page.reload()
  await divider.waitFor()
  assert.equal(await currentWidth(), preferredWidth, '刷新恢复左栏宽度')

  await page.setViewportSize({ width: 1024, height: 900 })
  await page.waitForFunction((width) => {
    const sidebar = document.querySelector('.erp-dev-docs-sidebar')
    const reader = document.querySelector('.erp-dev-docs-reader')
    return sidebar.getBoundingClientRect().width < width && reader.getBoundingClientRect().width >= 480
  }, preferredWidth)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '桌面宽度被正文约束限制')
  await page.setViewportSize({ width: 390, height: 844 })
  await divider.waitFor({ state: 'hidden' })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄屏上下排列而且无横向溢出')

  await page.setViewportSize(viewport)
  await divider.waitFor({ state: 'visible' })
  assert.equal(await currentWidth(), preferredWidth, '窗口放宽后恢复原宽度偏好')
}

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
      '.erp-dev-docs-lifecycle, .erp-dev-docs-search, [role="group"][aria-label="项目文档搜索范围"]'
    return {
      headerControls: header.querySelectorAll(controls).length,
      sidebarControls: sidebar.querySelectorAll(controls).length,
      repeatedPaths: sidebar.querySelectorAll('.erp-dev-docs-tree__doc-path, .erp-dev-docs-pinned__path').length,
      readableDirectory: sidebar.querySelector('[data-dev-doc-dir="docs"]')?.textContent,
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
  assert.equal(geometry.repeatedPaths, 0, '目录只展示标题，完整路径在提示和阅读栏中保留')
  assert(geometry.readableDirectory.includes('项目文档'), '目录以可读主题名导航')
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

export async function verifyDevDocsScopeHelp(page, assert) {
  const header = page.locator('.erp-dev-docs-header')
  const trigger = header.getByRole('button', { name: /收录范围/u })
  const help = page.getByText(/^只读加载当前工作区的 Markdown/u)
  await trigger.waitFor()
  await waitForFiniteAnimations(page, { selector: '.erp-dev-docs-page' })
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')

  await trigger.evaluate((button) => {
    const root = button.closest('.erp-dev-docs-page')
    const nodes = [
      ['收录范围', button],
      ...['header', 'controls', 'search', 'sidebar', 'reader'].map((part) => [
        part,
        root.querySelector(`.erp-dev-docs-${part}`),
      ]),
    ]
    const read = (node) => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return [x, y, width, height]
    }
    const before = nodes.map(([, node]) => read(node))
    let frameId
    let frames = 0
    let shift = null
    const sample = () => {
      frames += 1
      for (const [index, [part, node]] of nodes.entries()) {
        const after = read(node)
        if (!node.isConnected || after.some((value, i) => Math.abs(value - before[index][i]) > 1)) {
          shift ??= { part, before: before[index], after }
          break
        }
      }
      frameId = requestAnimationFrame(sample)
    }
    frameId = requestAnimationFrame(sample)
    root.stopScopeHelpLayoutSample = () => {
      cancelAnimationFrame(frameId)
      delete root.stopScopeHelpLayoutSample
      return { frames, shift }
    }
  })

  let sample
  try {
    await trigger.click()
    await help.waitFor({ state: 'visible' })
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
    await waitForFiniteAnimations(page, { selector: '.erp-supplemental-help-popover' })
    assert(await help.evaluate((element) => {
      const { left, right, top, bottom } = element.closest('.erp-supplemental-help-popover').getBoundingClientRect()
      return left >= -1 && right <= innerWidth + 1 && top >= -1 && bottom <= innerHeight + 1
    }), '收录范围浮层应在视口内完整显示')
    await trigger.click()
    await help.waitFor({ state: 'hidden' })

    await header.getByRole('button', { name: '文档首页', exact: true }).focus()
    await page.keyboard.press('Tab')
    await help.waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await help.waitFor({ state: 'hidden' })
    assert(await trigger.evaluate((button) => document.activeElement === button), '关闭说明后键盘焦点应留在触发按钮')

    await trigger.click()
    await help.waitFor({ state: 'visible' })
    await header.getByRole('heading', { name: '项目文档', exact: true }).click()
    await help.waitFor({ state: 'hidden' })
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  } finally {
    sample = await page.locator('.erp-dev-docs-page').evaluate((root) => root.stopScopeHelpLayoutSample())
  }
  assert(sample.frames > 1, '收录范围开关期间应采到真实浏览器帧')
  assert.equal(sample.shift, null, `收录范围开关推动了布局：${JSON.stringify(sample.shift)}`)
}

export function createDevDocsReadingFixture(keyword) {
  const body = '示例正文，用于验证滚动定位与章节层级。'.repeat(45)
  return [
    '# 归档全文检索探针',
    keyword,
    '[跳到章节内的子标题](#阅读子标题)',
    ...Array.from({ length: 20 }, (_, index) => {
      const title = index === 4
        ? '阅读章节 5 的完整标题需要在狭窄的章节目录中分行显示'
        : `阅读章节 ${index + 1}`
      const chapter = `## ${title}\n\n${body}`
      if (index === 7) return `${chapter}\n\n### 另一个主章的小节\n\n${body}`
      if (index !== 4) return chapter
      return [
        `<!-- dev-docs:collapse -->\n${chapter}`,
        '### 5.1 有编号小节的完整标题需要在缩进后自然换行',
        body,
        '### 阅读子标题',
        body,
        '#### 深层说明',
        body,
      ].join('\n\n')
    }),
  ].join('\n\n')
}

async function waitForDevDocsHeadingLanding(page, headingId, currentId = headingId) {
  await page.waitForFunction(({ headingId, currentId }) => {
    const article = document.querySelector('.erp-dev-docs-markdown')
    const heading = document.getElementById(headingId)
    const target = heading?.closest('summary') ?? heading
    const current = document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
    return current?.dataset.devDocHeadingId === currentId && target && article?.contains(target) &&
      Math.abs(target.getBoundingClientRect().top - article.getBoundingClientRect().top - 8) <= 1
  }, { headingId, currentId })
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
  const navigation = page.getByRole('navigation', { name: '文档章节', exact: true })
  const collapseAll = navigation.getByRole('button', { name: '收起全部', exact: true })
  const expandAll = navigation.getByRole('button', { name: '展开全部', exact: true })
  const visibleSubsections = toc.locator('.erp-directory-branch button:visible')
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.erp-dev-docs-toc [data-dev-doc-heading-id]')
        .length === 23
  )
  assert.deepEqual(
    await chapters.evaluateAll((items) => items.map((item) => item.dataset.devDocHeadingId)),
    await page.locator('.erp-dev-docs-markdown :is(h2, h3)[data-markdown-anchor="heading"]')
      .evaluateAll((headings) => headings.map((heading) => heading.id)),
    '目录按正文顺序包含主章和小节，深层标题留在正文'
  )
  assert.equal(await collapseAll.count(), 1, '多级目录在标题栏提供一个批量开合按钮')
  assert.equal(await visibleSubsections.count(), 3, '首次打开目录默认显示所有小节')
  assert.equal(await toc.locator('button[aria-expanded]').count(), 0, '章节条目只提供跳转')
  const top = page.getByRole('button', { name: '回到顶部', exact: true })
  await page.waitForFunction(
    () =>
      document
        .querySelector('.erp-dev-docs-reader__top')
        ?.getAttribute('aria-current') === 'location'
  )
  await navigation.waitFor()
  const chapterLayout = await toc.evaluate((element) => {
    const longTitle = element.querySelectorAll('[data-dev-doc-heading-id] > span')[4]
    const chapterBox = longTitle.getBoundingClientRect()
    const header = element.parentElement.querySelector('.erp-dev-docs-toc__header')
    const labelBox = header.firstElementChild.getBoundingClientRect()
    const toggleBox = header.querySelector('button').getBoundingClientRect()
    const branch = longTitle.closest('li').querySelector(':scope > ul')
    const subsectionTitles = [
      ...longTitle.closest('li').querySelectorAll(':scope > ul > li > button > span'),
    ]
    const numberedTitle = subsectionTitles[0]
    element.scrollTop = element.scrollHeight
    return {
      wraps: chapterBox.height > Number.parseFloat(getComputedStyle(longTitle).lineHeight) + 1,
      subsectionWraps: numberedTitle.getBoundingClientRect().height >
        Number.parseFloat(getComputedStyle(numberedTitle).lineHeight) + 1,
      subsectionIndents: subsectionTitles.map((title) => title.getBoundingClientRect().left - chapterBox.left),
      branchGuideWidth: getComputedStyle(branch).borderInlineStartWidth,
      headerControlsFit: toggleBox.height >= 24 && toggleBox.left >= labelBox.right - 1 &&
        toggleBox.right <= header.getBoundingClientRect().right + 1,
      chapterScroll: element.scrollTop,
      bodyScroll: document.querySelector('.erp-dev-docs-markdown').scrollTop,
      horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
    }
  })
  assert(chapterLayout.wraps, '长章节标题可完整换行')
  assert(chapterLayout.subsectionWraps, '缩进的长小节标题可完整换行')
  assert.deepEqual(chapterLayout.subsectionIndents, [16, 16], '有编号和无编号的小节使用统一层级缩进')
  assert.equal(chapterLayout.branchGuideWidth, '1px', '小节使用共用的分支引导线')
  assert(chapterLayout.headerControlsFit, '标题栏可容纳目录名称和批量开合按钮')
  assert(chapterLayout.chapterScroll > 0 && chapterLayout.bodyScroll === 0, '章节列表可独立滚到末尾')
  assert(!chapterLayout.horizontalOverflow, '长标题在章节栏内换行')
  const lastId = await chapters.last().getAttribute('data-dev-doc-heading-id')
  await chapters.last().click()
  await page.waitForURL((url) => decodeURIComponent(url.hash.slice(1)) === lastId)
  await page.waitForFunction(
    (id) =>
      document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
        ?.dataset.devDocHeadingId === id,
    lastId
  )
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), lastId)

  await top.click()
  await page.waitForURL((url) => url.hash === '')
  await page.waitForFunction(
    () =>
      document.querySelector('.erp-dev-docs-markdown').scrollTop <= 1 &&
      document
        .querySelector('.erp-dev-docs-reader__top')
        ?.getAttribute('aria-current') === 'location'
  )
  await page.waitForFunction(() => document.querySelector('.erp-dev-docs-toc').scrollTop <= 1)

  const scrollRegion = page.locator('.erp-dev-docs-markdown')
  const collapsedChapter = scrollRegion.locator('details.erp-dev-docs-section')
  const chapter = chapters.nth(4)
  const chapterId = await chapter.getAttribute('data-dev-doc-heading-id')
  assert.equal(await collapsedChapter.getAttribute('open'), null)
  const numberedSubsection = toc.getByRole('button', { name: /^5\.1 有编号小节/u })
  const subsectionId = await numberedSubsection.getAttribute('data-dev-doc-heading-id')
  await numberedSubsection.click()
  await page.waitForURL((url) => decodeURIComponent(url.hash.slice(1)) === subsectionId)
  await waitForDevDocsHeadingLanding(page, subsectionId)
  assert.equal(await collapsedChapter.evaluate((element) => element.open), true, '目录直达折叠章节中的小节')

  await collapseAll.click()
  await waitForDevDocsHeadingLanding(page, subsectionId, chapterId)
  assert.equal(await visibleSubsections.count(), 0, '批量收起隐藏所有主章的小节')
  assert.equal(await toc.locator(':scope > li > button').count(), 20, '批量收起后所有主章继续提供跳转')
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), subsectionId)

  await chapter.click()
  await page.waitForURL((url) => decodeURIComponent(url.hash.slice(1)) === chapterId)
  await waitForDevDocsHeadingLanding(page, chapterId)
  assert(await expandAll.isVisible(), '点击主章标题直接跳转并保留目录收起状态')

  const nextSubsectionId = '阅读子标题'
  const nextScrollDistance = await scrollRegion.evaluate(
    (article, id) => document.getElementById(id).getBoundingClientRect().top - article.getBoundingClientRect().top - 8,
    nextSubsectionId
  )
  await scrollRegion.hover()
  await page.mouse.wheel(0, nextScrollDistance)
  await waitForDevDocsHeadingLanding(page, nextSubsectionId, chapterId)
  assert.equal(await visibleSubsections.count(), 0, '阅读收起的小节时保持目录收起')
  await expandAll.press('Space')
  await waitForDevDocsHeadingLanding(page, nextSubsectionId)
  assert.equal(await visibleSubsections.count(), 3, '键盘批量展开后恢复所有小节')
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), chapterId, '滚动正文和开合目录保留显式跳转锚点')

  const nextChapter = toc.getByRole('button', { name: '阅读章节 6', exact: true })
  const nextChapterId = await nextChapter.getAttribute('data-dev-doc-heading-id')
  const chapterScrollDistance = await scrollRegion.evaluate((article, id) => {
    const heading = document.getElementById(id)
    const padding = Number.parseFloat(getComputedStyle(article).paddingBlockStart)
    return heading.getBoundingClientRect().top - article.getBoundingClientRect().top - padding - 4
  }, nextChapterId)
  await page.mouse.wheel(0, chapterScrollDistance)
  await page.waitForFunction((id) => {
    const current = document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
    const title = document.getElementById(id)
    return current?.dataset.devDocHeadingId === id && title?.dataset.currentSectionTitle === 'true'
  }, nextChapterId)
  assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), chapterId, '新主章进入阅读区顶部时接替上一小节，保留显式跳转锚点')

  await top.click()
  await page.waitForURL((url) => url.hash === '')
  await page.getByRole('link', { name: '跳到章节内的子标题', exact: true }).click()
  await page.waitForURL((url) => decodeURIComponent(url.hash.slice(1)) === nextSubsectionId)
  await waitForDevDocsHeadingLanding(page, nextSubsectionId)
  await collapseAll.click()
  await waitForDevDocsHeadingLanding(page, nextSubsectionId, chapterId)
  await page.reload()
  await waitForDevDocsHeadingLanding(page, nextSubsectionId)
  assert.equal(await visibleSubsections.count(), 3, '刷新后按默认展开目录')
  const highlightedTitle = scrollRegion.locator('details[data-current-section-title="true"] > summary > h2')
  assert.equal(await highlightedTitle.getAttribute('id'), chapterId, '刷新小节锚点后同步标示所属主章')

  const firstId = await chapters.first().getAttribute('data-dev-doc-heading-id')
  await chapters.first().press('Enter')
  await page.waitForURL((url) => decodeURIComponent(url.hash.slice(1)) === firstId)
  await page.waitForFunction(
    (id) =>
      document.querySelector('.erp-dev-docs-toc [aria-current="location"]')
        ?.dataset.devDocHeadingId === id,
    firstId
  )
  const focus = await chapters.first().evaluate((element) => ({
    width: getComputedStyle(element).outlineWidth,
    style: getComputedStyle(element).outlineStyle,
    active: document.activeElement === element,
    visible: element.matches(':focus-visible'),
  }))
  assert(
    Number.parseFloat(focus.width) >= 2 && focus.style !== 'none',
    `键盘定位章节应有清楚焦点：${JSON.stringify(focus)}`
  )
  const hashBeforeScroll = new URL(page.url()).hash
  const scrollDistance = await scrollRegion.evaluate((element) => element.scrollHeight * 0.55)
  await scrollRegion.hover()
  await page.mouse.wheel(0, scrollDistance)
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
  const visual = await toc.evaluate((element) => {
    const selected = element.querySelector('[aria-current="location"]')
    const idle = element.querySelector('button:not([aria-current])')
    const activeStyle = getComputedStyle(selected)
    const idleStyle = getComputedStyle(idle)
    const activeHeading = document.querySelector('.erp-dev-docs-markdown h2[data-current-section-title="true"]')
    const idleHeading = document.querySelector('.erp-dev-docs-markdown h2.erp-business-form-heading:not([data-current-section-title])')
    const box = selected.getBoundingClientRect()
    const frame = element.getBoundingClientRect()
    return {
      selectedCount: element.querySelectorAll('[aria-current="location"]')
        .length,
      backgroundDistinct:
        activeStyle.backgroundColor !== idleStyle.backgroundColor,
      textDistinct: activeStyle.color !== idleStyle.color,
      shadow: activeStyle.boxShadow,
      weight: activeStyle.fontWeight,
      headingMatches: activeHeading?.id === selected.dataset.devDocHeadingId,
      headingHighlighted: activeHeading && idleHeading &&
        getComputedStyle(activeHeading).backgroundColor !== getComputedStyle(idleHeading).backgroundColor,
      headingAccentMatches: activeHeading && getComputedStyle(activeHeading).color === activeStyle.color,
      visible: box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1,
    }
  })
  assert.equal(visual.selectedCount, 1)
  assert(visual.headingMatches && visual.headingHighlighted && visual.headingAccentMatches, '正文标题带随目录同步使用主题色高亮')
  assert(
    visual.backgroundDistinct && visual.textDistinct && visual.weight === '600',
    '当前章节以主题浅底和加粗文字突出'
  )
  assert.equal(visual.shadow, 'none', '章节目录不叠加选中底线')
  assert(visual.visible, '手工阅读时目录应自动滚动到当前章节')

  await page.goto(
    new URL(
      `/__dev/docs?path=${encodeURIComponent('docs/部署约定.md')}`,
      page.url()
    ).href
  )
  await page.locator('.erp-dev-docs-markdown h1').waitFor()
  await navigation.waitFor()
  for (const width of [1920, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    await waitForFiniteAnimations(page)
    const geometry = await page
      .locator('.erp-dev-docs-reader')
      .evaluate((root) => {
        const toolbar = root.querySelector('.erp-dev-docs-reader__toolbar')
        const name = root.querySelector('.erp-dev-docs-reader__name')
        const path = root.querySelector('.erp-dev-docs-reader__path')
        const sidebar = root.closest('.erp-dev-docs-shell').querySelector('.erp-dev-docs-sidebar')
        const chapterNav = root.querySelector('.erp-dev-docs-toc-shell')
        const article = root.querySelector('.erp-dev-docs-markdown')
        const chapter = chapterNav.querySelector('[data-dev-doc-heading-id]')
        const center = (element) => {
          const box = element.getBoundingClientRect()
          return box.top + box.height / 2
        }
        const toolbarBox = toolbar.getBoundingClientRect()
        const sidebarBox = sidebar.getBoundingClientRect()
        const navBox = chapterNav.getBoundingClientRect()
        const articleBox = article.getBoundingClientRect()
        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          },
          toolbarHeight: toolbarBox.height,
          sidebarWidth: sidebarBox.width,
          navHeight: navBox.height,
          articleWidth: articleBox.width,
          navLeftOfArticle: Math.abs(navBox.right - articleBox.left) <= 1 && Math.abs(navBox.top - articleBox.top) <= 1,
          navAboveArticle: Math.abs(navBox.bottom - articleBox.top) <= 1 && Math.abs(navBox.width - articleBox.width) <= 1,
          chapterHeight: chapter.getBoundingClientRect().height,
          titlePathCenterDelta: Math.abs(center(name) - center(path)),
          titleHint: name.title.startsWith(name.textContent),
          pathHint: path.title === path.textContent,
          fontSize: Number.parseFloat(getComputedStyle(chapter).fontSize),
          allControlsInside: [...toolbar.querySelectorAll('button')].every((button) => {
            const box = button.getBoundingClientRect()
            return (
              box.left >= toolbarBox.left &&
              box.right <= toolbarBox.right &&
              box.top >= toolbarBox.top &&
              box.bottom <= toolbarBox.bottom
            )
          }),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1,
        }
      })
    console.info(
      `[style:l1:docs-reader] width=${width} ${JSON.stringify(geometry)}`
    )
    assert(
      geometry.toolbarHeight <= (width === 1920 ? 50 : 90),
      '标题、路径和操作按可用宽度紧凑排列'
    )
    assert(geometry.chapterHeight >= 40, '章节目录保留共享点击高度')
    assert(geometry.titlePathCenterDelta <= 1, '标题与路径同行对齐')
    assert(
      geometry.titleHint && geometry.pathHint,
      '截断标题和路径仍保留完整提示'
    )
    assert(
      geometry.fontSize >= 14 &&
        geometry.allControlsInside &&
        !geometry.horizontalOverflow,
      `压缩后保留字号、完整操作且页面无横向溢出：${JSON.stringify(geometry)}`
    )
    if (width === 390) {
      assert(geometry.navAboveArticle && geometry.navHeight < 180, '窄屏章节保留有限高度，正文占满该行')
      await chapters.first().click()
      await page.waitForFunction(() => document.querySelector('.erp-dev-docs-markdown').scrollTop > 0)
    } else {
      assert(geometry.sidebarWidth <= 240 && geometry.navLeftOfArticle, '桌面文档列表收窄，章节与正文齐顶并排')
      assert(!geometry.verticalOverflow, '桌面目录与正文各自滚动')
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('textbox', { name: '搜索项目文档' }).fill('没有该标题 docs-governance')
  await page.getByRole('textbox', { name: '搜索项目文档' }).press('Enter')
  await page.getByText('没有匹配的文档，阅读操作已隐藏', { exact: true }).waitFor()
  assert.equal(await navigation.count(), 0, '无匹配文档时隐藏章节目录')
  await page.getByRole('button', { name: '文档首页', exact: true }).click()
  const home = page.locator('.erp-dev-docs-markdown').getByRole('heading', { name: '文档入口与治理 / docs Guide', exact: true })
  await home.waitFor()
  await navigation.waitFor()
  assert.equal(await collapseAll.count() + await expandAll.count(), 0, '一级目录直接展示主章跳转')
  assert.equal(await page.getByRole('textbox', { name: '搜索项目文档' }).inputValue(), '')
  assert.equal(new URL(page.url()).searchParams.get('path'), 'docs/README.md')
  await page.reload()
  await home.waitFor()
  await page.locator('.erp-dev-docs-markdown').getByRole('link', { name: '产品与路线', exact: true }).click()
  await page.locator('.erp-dev-docs-markdown').getByRole('heading', { name: '产品与路线 / Product Docs', exact: true }).waitFor()
  await page.goBack()
  await home.waitFor()
  const reader = page.locator('.erp-dev-docs-reader')
  await reader.getByRole('button', { name: '取消置顶', exact: true }).click()
  await page.reload()
  await home.waitFor()
  assert.equal(await reader.getByRole('button', { name: '置顶文档', exact: true }).getAttribute('aria-pressed'), 'false')
  await reader.getByRole('button', { name: '置顶文档', exact: true }).click()
  await page.setViewportSize({ width: 3840, height: 2160 })
  await waitForFiniteAnimations(page)
  await assertDevDocsDirectorySpace(page, assert)
  const prose = await page.locator('.erp-dev-docs-document > p').first().evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    font: parseFloat(getComputedStyle(element).fontSize),
    line: parseFloat(getComputedStyle(element).lineHeight),
  }))
  assert(prose.font >= 14 && prose.width <= prose.font * 50 + 1 && prose.line >= prose.font * 1.8, `正文保持字号、适当行宽与行距：${JSON.stringify(prose)}`)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '4K 下正文与目录不造成页面横向溢出')

  await page.setViewportSize({ width: 1440, height: 900 })
  const bookmarkPath = 'docs/product/移动端岗位任务页改版.md'
  const bookmark = new URL('/__dev/docs', page.url())
  bookmark.searchParams.set('path', bookmarkPath)
  bookmark.hash = 'ui-交互设计'
  const expectBookmarkedSection = async (anchor) => {
    await page.waitForFunction(() => {
      const reader = document.querySelector('.erp-dev-docs-markdown')
      const heading = document.getElementById('交互设计')
      if (!reader || !heading || !document.getElementById('ui-交互设计')) return false
      const frame = reader.getBoundingClientRect()
      const section = heading.getBoundingClientRect()
      return reader.scrollTop > 0 && section.top >= frame.top - 1 && section.bottom <= frame.bottom + 1
    })
    const url = new URL(page.url())
    assert.equal(url.searchParams.get('path'), bookmarkPath)
    assert.equal(decodeURIComponent(url.hash.slice(1)), anchor)
  }
  await page.goto(bookmark.href)
  await expectBookmarkedSection('ui-交互设计')
  await page.reload()
  await expectBookmarkedSection('ui-交互设计')
  await page.getByRole('button', { name: '文档首页', exact: true }).click()
  await home.waitFor()
  await page.goBack()
  await expectBookmarkedSection('ui-交互设计')
  await page.locator('.erp-dev-docs-toc').getByRole('button', { name: '交互设计', exact: true }).click()
  await expectBookmarkedSection('交互设计')
  await page.reload()
  await expectBookmarkedSection('交互设计')

  await verifyDevDocsCollapsedSections(page, assert)
}

async function verifyDevDocsCollapsedSections(page, assert) {
  const auditURL = new URL('/__dev/docs', page.url())
  auditURL.searchParams.set('path', 'docs/observability/日志链路追踪与审计.md')
  await page.goto(auditURL.href)

  const article = page.locator('.erp-dev-docs-markdown')
  const chapters = page.getByRole('navigation', { name: '文档章节', exact: true })
  const disclosures = article.locator('details.erp-dev-docs-section')
  const openSections = article.locator('details.erp-dev-docs-section[open]')
  const auditMatrix = disclosures.filter({ has: page.locator('h2[id="模块级覆盖矩阵"]') })
  await auditMatrix.locator('summary').waitFor()
  assert.equal(await disclosures.count(), 1)
  assert.equal(await auditMatrix.evaluate((section) => section.open), false)
  await article.getByRole('heading', { name: '关键原则', exact: true }).waitFor()

  for (const [tag, marker] of [['ol', 'decimal'], ['ul', 'disc']]) {
    const list = article.locator(`.erp-dev-docs-document > ${tag}`).first()
    const style = await list.evaluate((element) => ({
      marker: getComputedStyle(element.firstElementChild).listStyleType,
      indent: parseFloat(getComputedStyle(element).paddingInlineStart),
    }))
    assert.equal(style.marker, marker, `正文 ${tag} 应显示原生列表标记`)
    assert(style.indent > 0, `正文 ${tag} 需要留出标记空间`)
  }

  const expectOpenAt = (id) => page.waitForFunction((headingId) => {
    const heading = document.getElementById(headingId)
    if (!heading?.closest('details.erp-dev-docs-section')?.open) return false
    const articleTop = heading.closest('.erp-dev-docs-markdown').getBoundingClientRect().top
    const target = heading.closest('summary') ?? heading
    return Math.abs(target.getBoundingClientRect().top - articleTop - 8) <= 2
  }, id)

  await chapters.getByRole('button', { name: '模块级覆盖矩阵', exact: true }).click()
  await expectOpenAt('模块级覆盖矩阵')
  await auditMatrix.locator('summary').press('Enter')
  await article.locator('details.erp-dev-docs-section:not([open])').waitFor()

  auditURL.hash = '库存'
  await page.goto(auditURL.href)
  await expectOpenAt('库存')
  await page.reload()
  await expectOpenAt('库存')

  const search = page.getByRole('textbox', { name: '搜索项目文档', exact: true })
  await search.fill('同粒度 ACTIVE 预留')
  await search.press('Enter')
  await page.locator('.erp-dev-docs-list__open').filter({ hasText: '业务公式与计算口径' }).click()
  await article.getByRole('heading', { name: /先看结论/u }).waitFor()
  await article.getByRole('heading', { name: /通用数值与舍入/u }).waitFor()
  assert.equal(await disclosures.count(), 7)
  assert.equal(await openSections.count(), 0)

  const inventoryHeading = '库存预留与来源余量--inventory-and-capacity'
  await chapters.getByRole('button', { name: '库存、预留与来源余量', exact: true }).click()
  await expectOpenAt(inventoryHeading)
  await article.getByRole('heading', { name: '库存可用量（公式 F08）', exact: true }).waitFor()
  assert.equal(await openSections.count(), 1)
}
