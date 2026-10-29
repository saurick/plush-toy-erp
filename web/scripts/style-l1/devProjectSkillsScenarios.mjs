import { expect } from 'playwright/test'

export function createDevProjectSkillsScenarios({ assert, assertNoHorizontalOverflow }) {
  return [{
    name: 'dev-project-skills-guidance-desktop-light',
    path: '/__dev/project-skills',
    viewport: { width: 1920, height: 1080 },
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
      await expect(page.locator('.erp-dev-skills__references, .erp-dev-skills__disclosure, .erp-dev-skills__detail .erp-markdown-mermaid')).toHaveCount(0)
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
    },
  }]
}
