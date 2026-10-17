import { writeFile } from 'node:fs/promises'

async function verifyOrderDirection({ assert, frame, exception, exceptionExpanded = true }) {
  const chain = frame.locator('.fulfillment-chain-preview')
  const stages = chain.locator('.fulfillment-chain-overview > li')
  assert.deepEqual(await stages.locator('.fulfillment-chain-marker').allTextContents(), ['1', '2', '3', '4', '5', '6', '7'])
  assert.deepEqual(await stages.locator('.fulfillment-chain-node > strong').allTextContents(), ['订单准备', '采购入库', '生产加工', '成品入库', '检验与包装', '放行与发货', '对账结清'])
  const geometry = await chain.evaluate((node) => {
    const items = [...node.querySelectorAll('.fulfillment-chain-overview > li')]
    const markers = items.map((item) => item.querySelector('.fulfillment-chain-marker').getBoundingClientRect())
    const branch = node.querySelector('.fulfillment-chain-exceptions')
    const marker = branch?.querySelector('.fulfillment-chain-marker')
    return {
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      stages: items.map((item, index) => {
        const box = item.getBoundingClientRect()
        const line = getComputedStyle(item, '::before')
        const noArrow = getComputedStyle(item, '::after').content === 'none'
        const next = markers[index + 1]
        const header = item.querySelector('.fulfillment-chain-node')
        const title = header.querySelector('strong').getBoundingClientRect()
        const status = header.querySelector(':scope > small').getBoundingClientRect()
        const chevron = header.querySelector('.fulfillment-chain-chevron svg').getBoundingClientRect()
        const center = (rect) => rect.top + rect.height / 2
        return {
          x: markers[index].x,
          y: markers[index].y,
          chevronAligned: Math.max(...[markers[index], title, status].map((rect) => Math.abs(center(rect) - center(chevron)))) <= 1 && Math.abs(header.getBoundingClientRect().right - chevron.right) <= 1,
          forward: noArrow && (next ? next.top > markers[index].bottom && Math.abs(next.left - markers[index].left) <= 1 &&
            Math.abs(box.top + parseFloat(line.top) - (markers[index].top + markers[index].height / 2)) <= 1 &&
            Math.abs(box.bottom - parseFloat(line.bottom) - (next.top + next.height / 2)) <= 1 && parseFloat(line.width) === 1 : line.content === 'none'),
        }
      }),
      branch: branch ? {
        separate: branch.parentElement === node,
        border: getComputedStyle(branch).borderTopStyle,
        markerBorder: getComputedStyle(marker).borderTopStyle,
        markerRadius: Number.parseFloat(getComputedStyle(marker).borderRadius),
        markerWidth: marker.getBoundingClientRect().width,
        label: branch.querySelector('.fulfillment-chain-branch')?.textContent,
      } : null,
    }
  })
  assert(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry))
  assert.equal(await chain.locator('.fulfillment-chain-order').count(), 0)
  assert.doesNotMatch(await chain.innerText(), /阶段顺序/u)
  assert(geometry.stages.every((stage) => stage.chevronAligned), JSON.stringify(geometry))
  assert(geometry.stages.every((stage) => stage.forward), JSON.stringify(geometry))
  if (exception) {
    assert.equal(geometry.branch?.separate, true)
    assert.equal(geometry.branch.border, 'dashed')
    assert.equal(geometry.branch.markerBorder, 'dashed')
    assert(geometry.branch.markerRadius < geometry.branch.markerWidth / 2)
    assert.equal(geometry.branch.label, '分支')
    if (exceptionExpanded) assert.match(await chain.locator('.fulfillment-chain-exceptions').innerText(), /方案、审批、执行与复检记录/)
  } else assert.equal(geometry.branch, null)
  return geometry
}

export function createDevTaskGovernanceScenarios({ assert, outputDir, path }) {
  return [false, true].map((mobile) => ({
    name: `dev-ui-task-fulfillment-${mobile ? 'mobile' : 'desktop'}`,
    path: '/__dev/ui-design?page=task-handling',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: /全屏预览/u }).click()
      const navigation = await page.locator('.erp-dev-ui-design-toolbar .erp-dev-ui-design-page-select').evaluate((node) => {
        const label = node.querySelector('.ant-select-selection-item')
        const range = document.createRange()
        range.selectNodeContents(label)
        const text = range.getBoundingClientRect()
        const box = label.getBoundingClientRect()
        return { width: node.clientWidth, scrollWidth: node.scrollWidth, labels: [{ title: label.textContent, fits: text.left >= box.left - 1 && text.right <= box.right + 1 }] }
      })
      await writeFile(path.join(outputDir, `ui-preview-navigation-${mobile ? 'mobile' : 'desktop'}.json`), JSON.stringify(navigation, null, 2))
      assert(navigation.labels.every((label) => label.fits), `预览入口文字不应重叠：${JSON.stringify(navigation)}`)
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      if (mobile) {
        await frame.locator('[data-action="open-mobile-tasks"]').click()
        await frame.getByLabel('预览身份', { exact: true }).selectOption('admin')
      }
      else await frame.locator('[data-action="board-status"][data-value="all"]').click()
      if (!mobile) {
        await frame.locator('#board-search').fill('审批工程用料申请')
        await frame.locator('.task-handling-table button[data-id="T01"]').click()
        const task = frame.locator('.drawer')
        const materials = task.getByRole('button', { name: '查看材料汇总', exact: true })
        assert.equal(await materials.evaluate((node) => Boolean(node.closest('.drawer-foot'))), true)
        assert.equal(await task.locator('.drawer-body').getByRole('button', { name: '查看材料汇总', exact: true }).count(), 0)
        assert.deepEqual((await task.locator('.drawer-foot button').allTextContents()).map((label) => label.trim()), ['查看附件', '查看材料汇总', '查看相关单据', '选择处理方式'])
        assert.equal(await task.locator('.task-steps button').count(), 3)
        await materials.click()
        const summary = frame.getByRole('dialog', { name: '材料汇总', exact: true })
        await summary.waitFor()
        await summary.getByRole('button', { name: '关闭材料汇总', exact: true }).click()
        await summary.waitFor({ state: 'hidden' })
        assert.equal(await materials.evaluate((node) => node === document.activeElement), true)
        await page.screenshot({ path: path.join(outputDir, 'task-material-footer-prototype.png'), scale: 'device' })
        await task.locator('.drawer-head [data-action="close-drawer"]').click()
      }
      const open = async (id, title) => {
        if (mobile) {
          await frame.locator('#mobile-task-search').fill(title)
          await frame.locator(`[data-action="mobile-open-task"][data-id="${id}"]`).click()
        } else {
          await frame.locator('#board-search').fill(title)
          await frame.locator(`.task-handling-table button[data-id="${id}"]`).click()
        }
        await frame.getByRole('heading', { name: '本任务处理进度', exact: true }).waitFor()
        await frame.locator('.fulfillment-chain-preview').getByText('当前暂无其他关联任务。', { exact: true }).waitFor()
        assert.equal(await frame.locator('.fulfillment-chain-preview li').count(), 0, '无关联任务时不重复绘制当前任务')
        await frame.getByRole('button', { name: '查看订单全流程', exact: true }).click()
        const chain = frame.locator('.fulfillment-chain-preview')
        await chain.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        const taskMarker = await chain.locator('.fulfillment-chain-task-marker').evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(node).borderRadius), symbol: node.textContent }))
        assert.ok(taskMarker.width === 26 && taskMarker.height === 26 && taskMarker.radius >= 13 && ['●', '!', '✓'].includes(taskMarker.symbol), JSON.stringify(taskMarker))
        const geometry = await verifyOrderDirection({ assert, frame, exception: id === 'H07' })
        if (id === 'H05' || id === 'H07') {
          const label = `ui-order-direction-${mobile ? 'mobile' : 'desktop'}-${id === 'H07' ? 'exception' : 'main'}`
          if (mobile) {
            await chain.getByRole('heading', { name: '订单全流程', exact: true }).scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(outputDir, `${label}.png`), scale: 'device' })
            await chain.locator('.fulfillment-chain-overview > li').last().scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(outputDir, `${label}-end.png`), scale: 'device' })
          } else await chain.screenshot({ path: path.join(outputDir, `${label}.png`) })
          await writeFile(path.join(outputDir, `${label}.json`), JSON.stringify(geometry, null, 2))
          await chain.locator('.fulfillment-chain-node[aria-expanded="true"]').click()
          assert.equal(await chain.locator('.fulfillment-chain-stage').count(), 0, '阶段内容可收起')
          const first = chain.locator('.fulfillment-chain-overview > li').first()
          await first.locator('.fulfillment-chain-node').click()
          await first.getByText('当前示例未提供本阶段任务。', { exact: true }).waitFor()
          await first.getByText('本阶段环节与岗位', { exact: true }).click()
          assert.equal(await first.locator('details').getAttribute('open'), '')
          await verifyOrderDirection({ assert, frame, exception: id === 'H07', exceptionExpanded: false })
        }
        await frame.getByRole('button', { name: '返回本任务', exact: true }).click()
        await chain.getByText('当前暂无其他关联任务。', { exact: true }).waitFor()
        assert.equal(await chain.locator('li').count(), 0, '返回后恢复本任务关联范围')
        if (mobile) {
          const footer = frame.locator('.rm-action-bar')
          assert.equal(await footer.locator('[data-action="mobile-attachments"]').count(), 1)
          assert.equal(await frame.locator('.rm-flow-scroll').getByRole('button', { name: '复制任务信息', exact: true }).count(), 0)
          const menu = frame.locator('.rm-flow-topbar .task-copy-menu')
          await menu.locator('summary').click()
          await menu.getByRole('button', { name: '复制任务信息', exact: true }).waitFor()
          await menu.locator('summary').click()
          await footer.locator('[data-action="mobile-open-process"]').click()
        }
      }
      const close = () => frame.locator(mobile ? '[data-action="mobile-return-list"]' : '.drawer-foot [data-action="close-drawer"]').click()
      const back = () => frame.locator(mobile ? '.rm-flow-head [data-action="mobile-back"]' : '.drawer-head [data-action="close-drawer"]').click()
      const submit = () => frame.locator('[data-action="handling-fulfillment"]').click()
      const field = (key) => frame.locator(`[data-handling-field="${key}"]`)
      await open('H08', '办理实际发货')
      await submit()
      await frame.getByRole('alert').filter({ hasText: '禁止实际发货' }).waitFor()
      await back()
      if (mobile) await frame.locator('.rm-flow-head [data-action="mobile-back"]').click()
      await open('H05', '手工成品正式入库')
      assert.equal(await field('counted').inputValue(), '', '实点数量不得默认代填')
      await field('counted').fill('239')
      await field('warehouse').selectOption('finished')
      await submit()
      await frame.getByRole('alert').waitFor()
      await field('counted').fill('240')
      await submit()
      await frame.getByText(/成品仓库存增加 240/u).waitFor()
      await close()
      await open('H09', '办理成品质量关口')
      await field('inspection').selectOption('passed')
      await submit()
      await close()
      await open('H06', '查货与包装')
      await field('checked').selectOption('passed')
      await field('packing').selectOption('packed')
      await submit()
      await frame.getByText(/库存仍为 240/u).waitFor()
      await close()
      await open('H08', '办理实际发货')
      await submit()
      await frame.getByText(/业务已办理 240/u).waitFor()
      await close()
      await open('H07', '决定裁片异常处理方案')
      await field('plan').selectOption('switch')
      await field('supplier').selectOption('original')
      await field('note').fill('尺寸不符，由另一加工厂重新加工并复检。')
      await submit()
      await frame.getByRole('alert').filter({ hasText: '其他加工厂' }).waitFor()
      await field('supplier').selectOption('replacement')
      await submit()
      await frame.getByText(/尚未执行库存处置/u).waitFor()
      const geometry = await frame.locator(mobile ? '.role-mobile-device' : '.drawer-body').evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }))
      assert(geometry.scroll <= geometry.width + 1, '办理区域无横向溢出')
      await page.screenshot({ path: path.join(outputDir, `task-fulfillment-${mobile ? 'mobile' : 'desktop-4k'}.png`), scale: 'device' })
    },
  }))
}
