import { expect } from 'playwright/test'

export async function assertChainNodeFilters(page, editor, assert) {
  const search = editor.getByRole('textbox', {
    name: '搜索业务节点',
    exact: true,
  })
  const perspectives = editor.getByRole('group', {
    name: '常用视角',
    exact: true,
  })
  const trigger = editor.getByRole('button', {
    name: '筛选业务节点',
    exact: true,
  })
  const panel = page.getByRole('dialog', { name: '筛选业务节点', exact: true })
  const items = editor.locator('.erp-chain-design__library-list')
  const read = () =>
    page.evaluate(() =>
      sessionStorage.getItem('plush-workbench:business-chain-design:working')
    )
  const before = await read()
  await perspectives
    .getByRole('button', { name: '岗位任务', exact: true })
    .click()
  await trigger.click()
  await panel
    .getByRole('group', { name: '按业务领域筛选', exact: true })
    .getByRole('button', { name: /^工程\s+\d+$/u })
    .click()
  await expect(items).toContainText('工程资料')
  await expect(
    items.getByRole('button', { name: '选择分支：订单审批', exact: true })
  ).toHaveCount(0)
  await panel.getByRole('button', { name: '收起', exact: true }).click()
  await expect(trigger).toBeFocused()
  await expect(
    editor.getByLabel('已选节点筛选', { exact: true })
  ).toContainText('工程')
  await search.fill('工程')
  await search.press('Enter')
  await trigger.click()
  await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
  await expect(search).toHaveValue('工程')
  await expect(
    perspectives.getByRole('button', { name: '岗位任务', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await panel.press('Escape')
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await search.fill('没有这个节点')
  await expect(items).not.toContainText('没有匹配节点')
  await editor.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(items).toContainText('没有匹配节点')
  await items.getByRole('button', { name: '查看全部节点', exact: true }).click()
  await expect(search).toHaveValue('')
  await perspectives
    .getByRole('button', { name: '岗位任务', exact: true })
    .click()
  await items
    .getByRole('button', { name: '选择分支：订单审批', exact: true })
    .click()
  await expect(
    items.getByRole('button', { name: /^加入：订单审批（/u })
  ).toHaveCount(2)
  assert.equal(
    await read(),
    before,
    '节点库筛选、展开目录分支不改画布或保存状态'
  )
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size)
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
    await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
    await panel.getByRole('button', { name: '收起', exact: true }).click()
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
  await perspectives
    .getByRole('button', { name: '业务步骤', exact: true })
    .click()
}
