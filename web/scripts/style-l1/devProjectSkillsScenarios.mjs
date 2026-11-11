import { expect } from 'playwright/test'

export function createDevProjectSkillsScenarios({ assert, assertNoHorizontalOverflow }) {
  return [{
    name: 'dev-project-skills-guidance-desktop-light',
    path: '/__dev/project-skills',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    expectedConsoleErrorPatterns: [/Failed to load resource: the server responded with a status of 503/u],
    verify: async (page) => {
      await page.getByText('结构检查通过', { exact: true }).waitFor()
      const response = await page.request.get(new URL('/__dev/api/project-skills', page.url()).href)
      assert.equal(response.status(), 200)
      const snapshot = await response.json()
      assert(snapshot.skills.length > 0)
      assert.equal(await page.locator('.erp-dev-skills__item').count(), snapshot.skills.length)
      const search = page.getByRole('textbox', { name: '搜索任务或 Skill' })
      await search.fill('plush-page-design-governance')
      await search.press('Enter')
      await expect(page.locator('.erp-dev-skills__item')).toHaveCount(1)
      await page.locator('.erp-dev-skills__item').click()
      const selectedURL = page.url()
      await page.reload()
      await expect(page.locator('.erp-dev-skills__name')).toHaveText('$plush-page-design-governance')
      const selected = snapshot.skills.find((skill) => skill.name === 'plush-page-design-governance')
      await expect(page.locator('.erp-dev-skills__detail')).toContainText(selected.scope)
      await expect(page.getByText('查看决策图', { exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: '复制调用名称', exact: true }).click()
      await page.getByText('Skill 调用名称已复制', { exact: true }).waitFor()
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => { throw new DOMException('模拟剪贴板拒绝访问', 'NotAllowedError') }
      })
      await page.getByRole('button', { name: '复制调用名称', exact: true }).click()
      await expect(page.getByText('复制失败，请手动复制页面中的调用名称', { exact: true })).toBeVisible()
      await expect(page.locator('.erp-dev-skills__name')).toHaveText('$plush-page-design-governance')
      const related = page.locator('.erp-dev-skills__related button').first()
      await expect(related).toBeVisible()
      await related.click()
      assert.notEqual(new URL(page.url()).searchParams.get('skill'), selected.name)
      await page.goto(selectedURL)
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertNoHorizontalOverflow(page, `Skill 选用 ${width}`)
      }
      let unavailable = true
      await page.route('**/__dev/api/project-skills', (route) => unavailable
        ? route.fulfill({ status: 503, body: '{}' }) : route.continue())
      await page.reload()
      const error = page.getByRole('alert').filter({ hasText: '项目 Skill 暂时无法读取' })
      await expect(error).toBeVisible()
      unavailable = false
      await error.getByRole('button', { name: '重新读取', exact: true }).click()
      await page.getByText('结构检查通过', { exact: true }).waitFor()
      await expect(page.locator('.erp-dev-skills__name')).toHaveText('$plush-page-design-governance')

      const operationSkill = snapshot.skills.find((skill) => skill.name === 'plush-operations-governance')
      assert(operationSkill)
      await search.fill(operationSkill.name)
      await search.press('Enter')
      await expect(page.locator('.erp-dev-skills__item')).toHaveCount(1)
      await page.locator('.erp-dev-skills__item').click()
      const disclosure = page.getByText('查看决策图', { exact: true })
      const note = page.getByRole('region', { name: '决策图节点说明' })
      const graph = page.locator('.erp-dev-skills__detail [data-mermaid-status="rendered"]')
      await expect(graph).toHaveCount(0)
      await disclosure.click()
      await expect(graph).toBeVisible()
      await expect(graph.locator('g.node[role="button"]')).toHaveCount(6)
      await expect(graph.locator('g.node:not([role="button"])')).toHaveCount(0)

      const inspect = graph.getByRole('button', { name: '实时环境核验', exact: true })
      const stop = graph.getByRole('button', { name: '暂停写入', exact: true })
      await inspect.hover()
      await expect(note).toContainText('先确认目标环境和最小复现证据')
      await inspect.press('Escape')
      await expect(note).toContainText('先区分已有证据、当前环境和计划写入')
      await stop.press('Enter')
      await expect(stop).toHaveAttribute('aria-pressed', 'true')
      await expect(stop).toBeFocused()
      await expect(note).toContainText('暂停受影响的写入')
      const decisionURL = page.url()
      await note.getByRole('link', { name: '查看 Skill 正文' }).click()
      await expect(page.getByRole('heading', { name: 'Stop Conditions / 停止条件' })).toBeVisible()
      assert.equal(new URL(page.url()).searchParams.get('path'), operationSkill.sourcePath)
      assert.equal(new URL(page.url()).hash, '#operations-stop')
      await page.goBack()
      await expect(page).toHaveURL(decisionURL)
      await expect(stop).toHaveAttribute('aria-pressed', 'true')
      await expect(search).toHaveValue(operationSkill.name)
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertNoHorizontalOverflow(page, `Skill 决策图 ${width}`)
        await expect(note.getByRole('link', { name: '查看 Skill 正文' })).toBeVisible()
      }

      await disclosure.click()
      await expect(graph).toHaveCount(0)
      await disclosure.click()
      await expect(note).toContainText('先区分已有证据、当前环境和计划写入')
      await stop.click()
      await expect(stop).toHaveAttribute('aria-pressed', 'true')
      await page.locator('.erp-dev-skills__related button').first().click()
      await expect(disclosure).toHaveCount(0)
      await expect(page.locator('.erp-dev-skills__name')).toHaveText('$plush-capability-evidence-audit')
      const unfilteredDecision = new URL(decisionURL)
      unfilteredDecision.searchParams.delete('q')
      await page.goto(unfilteredDecision.href)
      await expect(stop).toHaveAttribute('aria-pressed', 'true')
    },
  }]
}
