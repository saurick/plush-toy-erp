import { expect } from 'playwright/test'

export async function chooseChainNodeView(page, editor, label) {
  await editor.getByRole('button', { name: /^筛选业务节点 · /u }).click()
  const panel = page.getByRole('dialog', { name: '筛选业务节点', exact: true })
  await panel.getByRole('group', { name: '常用视角' }).getByRole('button', { name: label, exact: true }).click()
  await panel.getByRole('button', { name: '收起', exact: true }).click()
}

export async function assertChainNodeFilters(page, editor, assert) {
  const search = editor.getByRole('textbox', {
    name: '搜索链路或业务节点',
    exact: true,
  })
  const trigger = editor.getByRole('button', { name: /^筛选业务节点 · /u })
  const panel = page.getByRole('dialog', { name: '筛选业务节点', exact: true })
  const close = panel.getByRole('button', { name: '收起', exact: true })
  const perspectives = panel.getByRole('group', { name: '常用视角', exact: true })
  const items = editor.locator('.erp-chain-design__library-list')
  const read = () =>
    page.evaluate(() =>
      sessionStorage.getItem('plush-workbench:business-chain-design:working')
    )
  const before = await read()
  await trigger.click()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('textbox')).toHaveCount(0)
  await panel.getByRole('button', { name: '委外发料到回货应付', exact: true }).click()
  await expect(trigger).toHaveAccessibleName(/来源链路：委外发料到回货应付/u)
  await expect(panel.getByRole('group', { name: '节点库范围', exact: true }).getByRole('button', { name: '全库', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: '清空来源链路', exact: true }).click()
  await expect(trigger).not.toHaveAccessibleName(/来源链路/u)
  await perspectives
    .getByRole('button', { name: '岗位任务', exact: true })
    .click()
  const domain = panel.getByRole('group', { name: '按业务领域筛选', exact: true })
  const engineering = domain.getByRole('button', { name: /^工程\s+\d+$/u })
  await engineering.click()
  await expect(engineering).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByText('业务领域：工程', { exact: true })).toHaveCount(0)
  const allDomains = domain.getByRole('button', { name: /^全部\s+\d+$/u })
  await allDomains.click()
  await expect(allDomains).toHaveAttribute('aria-pressed', 'true')
  await expect(trigger).toHaveAccessibleName('筛选业务节点 · 岗位任务')
  await engineering.click()
  await expect(items).toContainText('工程资料')
  await expect(
    items.getByRole('button', { name: '选择分支：订单审批', exact: true })
  ).toHaveCount(0)
  await expect(trigger.locator('.erp-control-count')).toHaveText('1')
  await expect(trigger).toHaveAccessibleName('筛选业务节点 · 岗位任务 · 业务领域：工程')
  await close.click()
  await expect(trigger).toBeFocused()
  await search.fill('工程')
  await search.press('Enter')
  await trigger.click()
  await panel.locator('header').getByRole('button', { name: '清空筛选', exact: true }).click()
  await expect(search).toHaveValue('工程')
  await expect(
    perspectives.getByRole('button', { name: '岗位任务', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(trigger).toHaveAccessibleName('筛选业务节点 · 岗位任务')
  await close.click()
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await search.fill('没有这个节点')
  await expect(items).not.toContainText('没有匹配节点')
  await editor.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(items).toContainText('没有匹配节点')
  await items.getByRole('button', { name: '查看全部节点', exact: true }).click()
  await expect(search).toHaveValue('')
  await chooseChainNodeView(page, editor, '岗位任务')
  const branch = items.getByRole('button', { name: '选择分支：订单审批', exact: true })
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await editor.getByRole('complementary', { name: '业务节点库' })
    .getByRole('button', { name: '收起全部', exact: true }).click()
  await expect(branch).toHaveAttribute('aria-expanded', 'false')
  await branch.press('Enter')
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await expect(branch).toHaveAccessibleDescription(/2 个分支/u)
  const branchLayout = await branch.evaluate((button) => {
    const container = button.nextElementSibling
    const title = (element) => element.querySelector('.erp-chain-design__library-copy').getBoundingClientRect().left
    return {
      sharedBranch: container.matches('.erp-directory-branch'),
      guideWidth: parseFloat(getComputedStyle(container).borderInlineStartWidth),
      indent: title(container) - title(button),
    }
  })
  assert.deepEqual(branchLayout, { sharedBranch: true, guideWidth: 1, indent: 16 })
  await expect(
    items.getByRole('button', { name: /^加入：订单审批（/u })
  ).toHaveCount(2)
  const firstSource = items.getByRole('button', { name: /^查看：订单审批（/u }).first()
  await firstSource.click()
  await expect(items).toBeHidden()

  await editor.getByRole('button', { name: '关闭画布说明', exact: true }).click()
  await expect(firstSource).toBeFocused()
  await expect(firstSource).toHaveAccessibleDescription(/销售 · 协同任务/u)
  await expect(firstSource).not.toHaveAttribute('aria-current', 'true')
  await editor.getByRole('button', { name: '收起节点库面板', exact: true }).press('Enter')
  const reopen = editor.getByRole('button', { name: '展开节点库', exact: true })
  await expect(reopen).toBeFocused()
  await reopen.press('Enter')
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  assert.equal(
    await read(),
    before,
    '节点库筛选、展开目录分支不改画布或保存状态'
  )
  for (const size of [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size)
    const libraryBox = await editor.getByRole('complementary', { name: '业务节点库' }).boundingBox()
    const resultsBox = await items.boundingBox()
    assert(resultsBox.y - libraryBox.y <= 100, '结果紧随匹配数和已用条件')
    const anchor = await search.boundingBox()
    await trigger.click()
    // Check the floating box throughout its opening, including the short viewport that cannot fit below the trigger.
    const frames = await panel.evaluate(async (element) => {
      const samples = []
      for (let i = 0; i < 20; i++) {
        await new Promise(requestAnimationFrame)
        const box = element.getBoundingClientRect()
        samples.push({
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          height: innerHeight,
          width: innerWidth,
        })
      }
      return samples
    })
    assert(
      frames.every(
        (box) =>
          box.top >= -1 &&
          box.bottom <= box.height + 1 &&
          box.left >= -1 &&
          box.right <= box.width + 1
      ),
      '分组筛选打开全程不越过视口'
    )
    await panel
      .getByRole('group', { name: '按节点类型筛选', exact: true })
      .getByRole('button', { name: /^业务单据\s+\d+$/u })
      .click()
    await expect(items).toContainText('没有匹配节点')
    await panel.locator('header').getByRole('button', { name: '清空筛选', exact: true }).click()
    await close.click()
    const after = await search.boundingBox()
    assert(
      Math.abs(anchor.x - after.x) <= 1 &&
        Math.abs(anchor.y - after.y) <= 1 &&
        anchor.width === after.width,
      '筛选前后搜索和目录列宽保持稳定'
    )
    const scroll = await items.evaluate((element) => ({
      height: element.clientHeight,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    assert(
      scroll.height > 100 && scroll.scrollWidth <= scroll.width + 1,
      '窄侧栏保持可读节点列表且无横向溢出'
    )
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const library = editor.getByRole('complementary', { name: '业务节点库' })
  const sidebarBox = await library.boundingBox()
  const listBox = await items.boundingBox()
  const canvasBox = await editor.locator('.erp-chain-design__canvas-area').boundingBox()
  assert(listBox.y + listBox.height <= sidebarBox.y + sidebarBox.height, '上下布局完整容纳可滚动的节点列表')
  assert(sidebarBox.y + sidebarBox.height <= canvasBox.y + 1, '画布位于节点库下方')
  assert((await search.boundingBox()).height >= 20, '搜索文字完整可见')
  await trigger.click()
  await expect(close).toBeInViewport()
  await expect.poll(async () => {
    const box = await panel.boundingBox()
    return box && box.width > 200 && box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 845
  }).toBe(true)
  await panel.press('Escape')
  await expect(trigger).toBeFocused()
  await search.fill('工程资料')
  await search.press('Enter')
  await expect(items.getByRole('button', { name: /^查看：工程资料/u }).first()).toBeVisible()
  await editor.getByRole('button', { name: '清除搜索', exact: true }).click()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await chooseChainNodeView(page, editor, '业务步骤')
}
