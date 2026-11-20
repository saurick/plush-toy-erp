import { readFileSync } from 'node:fs'
import { expect } from 'playwright/test'
import { extractMarkdownHeadings } from '../../src/common/components/markdown/anchors.mjs'
import { PROJECT_SKILL_STEP_FIELDS, readProjectSkillExecutionGuides } from '../../src/dev-workbench/config/devProjectSkills.mjs'

const renderedText = (source) => source.replace(/`([^`]+)`/gu, '$1')

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
      const detail = page.getByRole('region', { name: '执行步骤详情' })
      const graph = page.locator('.erp-dev-skills__detail [data-mermaid-status="rendered"]')
      const topicSelect = page.locator('.erp-dev-skills__topic-tools .ant-select-selector')
      const directory = page.locator('.erp-dev-skills__list')
      await search.fill('plush-page-design-governance')
      await search.press('Enter')
      await expect(page.locator('.erp-dev-skills__item')).toHaveCount(1)
      await page.locator('.erp-dev-skills__item').click()
      const selectedURL = page.url()
      await page.reload()
      await expect(page.locator('.erp-dev-skills__name')).toHaveText('$plush-page-design-governance')
      await expect(graph).toBeVisible()
      await expect(page.getByRole('heading', { name: '相关 Skill', exact: true })).toHaveCount(0)
      await expect(page.locator('.erp-dev-skills__detail details')).toHaveCount(0)
      await page.getByRole('button', { name: '复制调用名称', exact: true }).click()
      await page.getByText('Skill 调用名称已复制', { exact: true }).waitFor()
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => { throw new DOMException('模拟剪贴板拒绝访问', 'NotAllowedError') }
      })
      await page.getByRole('button', { name: '复制调用名称', exact: true }).click()
      await expect(page.getByText('复制失败，请手动复制页面中的调用名称', { exact: true })).toBeVisible()
      await search.fill('')
      await search.press('Enter')
      await directory.getByRole('button', { name: snapshot.skills[0].title, exact: true }).click()
      await expect(page.locator('.erp-dev-skills__name')).toHaveText(`$${snapshot.skills[0].name}`)
      await page.goto(selectedURL)
      let unavailable = true
      await page.route('**/__dev/api/project-skills', (route) => unavailable
        ? route.fulfill({ status: 503, body: '{}' }) : route.continue())
      await page.reload()
      const error = page.getByRole('alert').filter({ hasText: '项目 Skill 暂时无法读取' })
      await expect(error).toBeVisible()
      unavailable = false
      await error.getByRole('button', { name: '重新读取', exact: true }).click()
      await page.getByText('结构检查通过', { exact: true }).waitFor()

      let verifiedTopics = 0
      let verifiedSteps = 0
      for (const skill of snapshot.skills) {
        const source = readFileSync(new URL(`../../../${skill.sourcePath}`, import.meta.url), 'utf8')
        const topics = readProjectSkillExecutionGuides(source)
        assert(topics.length > 0, `${skill.name} needs execution topics`)
        await search.fill(skill.name)
        await search.press('Enter')
        await page.locator('.erp-dev-skills__item').click()
        assert.equal(new URL(page.url()).searchParams.get('topic'), null)
        assert.equal(new URL(page.url()).searchParams.get('step'), null)
        await expect(page.getByRole('heading', { name: '相关 Skill', exact: true })).toHaveCount(0)
        await expect(page.locator('.erp-dev-skills__detail details')).toHaveCount(0)
        for (const [topicIndex, topic] of topics.entries()) {
          if (topicIndex > 0) {
            await topicSelect.click()
            await page.locator('.ant-select-dropdown:visible').getByText(topic.title, { exact: true }).click()
            assert.equal(new URL(page.url()).searchParams.get('topic'), topic.id)
            assert.equal(new URL(page.url()).searchParams.get('step'), null)
          }
          await expect(page.locator('.erp-dev-skills__topic-tools .ant-select-selection-item')).toHaveText(topic.title)
          await expect(graph).toBeVisible()
          await expect(graph.locator('g.node[role="button"]')).toHaveCount(topic.nodes.length)
          await expect(graph.locator('g.node:not([role="button"])')).toHaveCount(0)
          await expect(graph.getByRole('button', { name: topic.nodes[0].label, exact: true })).toHaveAttribute('aria-pressed', 'true')
          for (const node of topic.nodes) {
            const trigger = graph.getByRole('button', { name: node.label, exact: true })
            await trigger.press('Enter')
            await trigger.press('Escape')
            await expect(trigger).toHaveAttribute('aria-pressed', 'true')
            await expect(detail.locator('.erp-dev-skills__step-field')).toHaveCount(4)
            for (const field of PROJECT_SKILL_STEP_FIELDS) {
              const block = detail.locator(`[data-step-field="${field.key}"]`)
              await expect(block.locator('dt')).toHaveText(field.label)
              await expect(block.locator('dd')).toHaveText(renderedText(node[field.key]))
            }
            assert.equal(new URL(page.url()).searchParams.get('topic'), topic.id)
            assert.equal(new URL(page.url()).searchParams.get('step'), node.id)
            verifiedSteps += 1
          }
          const selected = topic.nodes.at(-1)
          const preview = graph.getByRole('button', { name: topic.nodes[0].label, exact: true })
          await preview.hover()
          await expect(detail.locator('[data-step-field="operation"] dd')).toHaveText(renderedText(selected.operation))
          await preview.press('Escape')
          const selectedURL = page.url()
          await page.reload()
          await expect(graph.getByRole('button', { name: selected.label, exact: true })).toHaveAttribute('aria-pressed', 'true')
          await expect(page.locator('.erp-dev-skills__topic-tools .ant-select-selection-item')).toHaveText(topic.title)
          await expect(search).toHaveValue(skill.name)
          const heading = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
            .find((item) => item.id === selected.headingId || item.aliases.includes(selected.headingId))
          assert(heading)
          await detail.getByRole('link', { name: '查看 Skill 正文' }).click()
          await expect(page.getByRole('heading', { name: heading.title, exact: true })).toBeVisible()
          assert.equal(new URL(page.url()).searchParams.get('path'), skill.sourcePath)
          assert.equal(new URL(page.url()).hash, `#${selected.headingId}`)
          await page.goBack()
          await expect(page).toHaveURL(selectedURL)
          await expect(graph.getByRole('button', { name: selected.label, exact: true })).toHaveAttribute('aria-pressed', 'true')
          for (const width of [1024, 1280, 1920]) {
            await page.setViewportSize({ width, height: 1080 })
            await assertNoHorizontalOverflow(page, `${skill.name}/${topic.id} ${width}`)
            await expect(detail.locator('[data-step-field="failure"]')).toBeVisible()
            await expect(detail.getByRole('link', { name: '查看 Skill 正文' })).toBeVisible()
          }
          if (process.env.STYLE_L1_OUTPUT_DIR &&
            (topicIndex === topics.length - 1 || topic.id === 'release' || topic.id === 'editor')) {
            await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/${skill.name}-${topic.id}.png` })
          }
          verifiedTopics += 1
        }
      }
      console.log(`[skill-execution] skills=${snapshot.skills.length} topics=${verifiedTopics} steps=${verifiedSteps}`)

      const invalidURL = new URL('/__dev/project-skills', page.url())
      invalidURL.searchParams.set('skill', snapshot.skills[0].name)
      invalidURL.searchParams.set('topic', 'unknown-topic')
      invalidURL.searchParams.set('step', 'unknown-step')
      await page.goto(invalidURL.href)
      await expect(graph).toBeVisible()
      await expect(graph.locator('g.node[role="button"]').first()).toHaveAttribute('aria-pressed', 'true')

      const testSkill = snapshot.skills.find((skill) => skill.name === 'plush-test-governance')
      const testSource = readFileSync(new URL(`../../../${testSkill.sourcePath}`, import.meta.url), 'utf8')
      const malformedSources = [
        testSource.replace(/^ {2}- 完成标准：.+\n/mu, ''),
        testSource.replace('## 执行流程 / Execution Guide', '## 暂无执行指引'),
      ]
      let malformedSource = malformedSources[0]
      let malformedRequests = 0
      const malformedRoute = async (route) => {
        if (route.request().url().includes('raw')) {
          malformedRequests += 1
          await route.fulfill({ status: 200, contentType: 'application/javascript', body: `export default ${JSON.stringify(malformedSource)}` })
        } else await route.continue()
      }
      await page.route('**/plush-test-governance/SKILL.md*', malformedRoute)
      const brokenURL = new URL('/__dev/project-skills?skill=plush-test-governance', page.url())
      for (const [index, source] of malformedSources.entries()) {
        malformedSource = source
        const previousRequests = malformedRequests
        if (index === 0) await page.goto(brokenURL.href)
        else await page.reload()
        await expect(page.getByRole('alert').filter({ hasText: '执行流程暂时无法显示' })).toBeVisible()
        await expect(page.getByRole('alert').getByRole('link', { name: '查看 Skill 正文' })).toBeVisible()
        assert(malformedRequests > previousRequests)
        await expect(graph).toHaveCount(0)
        await expect(detail).toHaveCount(0)
      }
      await page.unroute('**/plush-test-governance/SKILL.md*', malformedRoute)
      await page.reload()
      await expect(graph).toBeVisible()
      await expect(page.getByText('执行流程暂时无法显示', { exact: true })).toHaveCount(0)

      await search.fill('没有匹配的 Skill 示例')
      await search.press('Enter')
      await expect(page.getByText('没有匹配的 Skill', { exact: true })).toBeVisible()
      await expect(graph).toHaveCount(0)
      assert.equal(new URL(page.url()).searchParams.get('topic'), null)
      assert.equal(new URL(page.url()).searchParams.get('step'), null)
    },
  }]
}
