async function expectSkillGraphFits(page, diagram) {
  await page.waitForFunction(
    (root) => {
      const viewport = root.querySelector('.erp-markdown-mermaid__viewport')
      return (
        root.dataset.mermaidStatus === 'rendered' &&
        viewport &&
        viewport.clientWidth > 0 &&
        viewport.clientHeight > 0 &&
        viewport.scrollWidth <= viewport.clientWidth + 2 &&
        viewport.scrollHeight <= viewport.clientHeight + 2
      )
    },
    await diagram.elementHandle()
  )
}

async function expectSelectedDocumentInTree(page, path) {
  await page.waitForFunction((selectedPath) => {
    const selected = document.querySelector(
      '.erp-dev-docs-tree__doc-shell--active'
    )
    const button = selected?.querySelector('[aria-current="true"]')
    const sidebar = document.querySelector('.erp-dev-docs-sidebar')
    if (
      !button ||
      !sidebar ||
      selected.dataset.devDocKey !== `doc:${selectedPath}`
    ) {
      return false
    }
    const item = button.getBoundingClientRect()
    const container = sidebar.getBoundingClientRect()
    return (
      item.top >= Math.max(container.top, 0) - 2 &&
      item.bottom <= Math.min(container.bottom, innerHeight) + 2
    )
  }, path)
}

export function createDevProjectSkillsScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return [
    {
      name: 'dev-project-skills-guidance-desktop-light',
      path: '/__dev/project-skills',
      viewport: { width: 1440, height: 900 },
      expectedConsoleErrorPatterns: [
        /Failed to load resource: the server responded with a status of 503/u,
      ],
      verify: async (page) => {
        await expectHeading(page, '项目 Skill')
        await page.getByText('结构检查通过', { exact: true }).waitFor()
        const disclosures = page.locator('.erp-dev-skills__disclosure')
        assert.deepEqual(
          await disclosures.evaluateAll((nodes) =>
            nodes.map((node) => node.open)
          ),
          [false],
          '关联与引用按需展开，默认保留适用任务'
        )
        assert.equal(await page.locator('.erp-dev-skills__disclosure .erp-markdown-mermaid').count(), 0)
        const response = await page.request.get(
          new URL('/__dev/api/project-skills', page.url()).href
        )
        assert.equal(response.status(), 200)
        const snapshot = await response.json()
        assert(snapshot.skills.length > 0)
        assert.equal(
          await page.locator('.erp-dev-skills__item').count(),
          snapshot.skills.length
        )
        const search = page.getByRole('textbox', { name: '搜索任务或 Skill' })
        await search.fill('plush-page-design-governance')
        await search.press('Enter')
        await page.waitForFunction(
          () => document.querySelectorAll('.erp-dev-skills__item').length === 1
        )
        await page.locator('.erp-dev-skills__item').click()
        const selectedURL = page.url()
        assert.equal(
          new URL(selectedURL).searchParams.get('skill'),
          'plush-page-design-governance'
        )
        await page.reload()
        await page.getByText('结构检查通过', { exact: true }).waitFor()
        assert.deepEqual(
          await disclosures.evaluateAll((nodes) => nodes.map((node) => node.open)),
          [false],
          '刷新后保持默认摘要，关系图由用户展开'
        )
        await disclosures.locator('summary').click()
        const invocationName = page.locator('.erp-dev-skills__name')
          .filter({ hasText: /^\$plush-page-design-governance$/u })
        await invocationName.waitFor()
        assert.equal(await invocationName.count(), 1)
        assert.equal(await search.inputValue(), 'plush-page-design-governance')
        await page
          .getByRole('button', { name: '复制调用名称', exact: true })
          .click()
        await page.getByText('Skill 调用名称已复制', { exact: true }).waitFor()
        assert.deepEqual(
          await disclosures.evaluateAll((nodes) =>
            nodes.map((node) => node.open)
          ),
          [true],
          '同一入口展开调用标识、关系图和引用依据'
        )
        const diagram = page.locator(
          '.erp-dev-skills__disclosure .erp-markdown-mermaid'
        )
        await diagram.locator('.erp-markdown-mermaid__canvas > svg').waitFor()
        await expectSkillGraphFits(page, diagram)
        assert((await diagram.innerText()).includes('引用依据'))
        await disclosures.nth(0).locator('summary').click()
        await page.waitForFunction(
          () =>
            !document.querySelector(
              '.erp-dev-skills__disclosure .erp-markdown-mermaid'
            )
        )
        assert.equal(
          await disclosures.nth(0).evaluate((node) => node.open),
          false
        )
        await disclosures.nth(0).locator('summary').click()
        await expectSkillGraphFits(page, diagram)
        const related = page.locator('.erp-dev-skills__related button').first()
        assert(await related.count())
        await related.click()
        assert.notEqual(
          new URL(page.url()).searchParams.get('skill'),
          'plush-page-design-governance'
        )
        assert.deepEqual(
          await disclosures.evaluateAll((nodes) =>
            nodes.map((node) => node.open)
          ),
          [true],
          '切换 Skill 后保留展开内容'
        )
        await page.goto(selectedURL)
        await page.getByRole('link', { name: '查看原文', exact: true }).click()
        await page
          .locator('.erp-dev-docs-markdown')
          .filter({ hasText: 'Project Page Gates' })
          .waitFor()
        assert.equal(
          new URL(page.url()).searchParams.get('path'),
          '.agents/skills/plush-page-design-governance/SKILL.md'
        )
        const sourcePath =
          '.agents/skills/plush-page-design-governance/SKILL.md'
        await expectSelectedDocumentInTree(page, sourcePath)
        const parentFolder = page.locator(
          '[data-dev-doc-dir=".agents/skills/plush-page-design-governance"]'
        )
        await parentFolder.click()
        assert.equal(await parentFolder.getAttribute('aria-expanded'), 'false')
        await page.reload()
        await page
          .locator('.erp-dev-docs-markdown')
          .filter({ hasText: 'Project Page Gates' })
          .waitFor()
        await expectSelectedDocumentInTree(page, sourcePath)
        const sourceReference = page
          .locator('.erp-dev-docs-markdown a')
          .filter({ hasText: 'Visual Finish' })
          .first()
        await sourceReference.click()
        await page
          .locator('.erp-dev-docs-markdown')
          .filter({ hasText: 'Visual Finish' })
          .waitFor()
        assert(
          new URL(page.url()).searchParams
            .get('path')
            .endsWith('/references/page-implementation.md')
        )
        assert.equal(new URL(page.url()).hash, '#visual-finish')
        await expectSelectedDocumentInTree(
          page,
          '.agents/skills/plush-page-design-governance/references/page-implementation.md'
        )
        await page.waitForFunction(() => {
          const container = document.querySelector('.erp-dev-docs-markdown')
          const heading = document.getElementById('visual-finish')
          if (!container || !heading) return false
          const outer = container.getBoundingClientRect()
          const target = heading.getBoundingClientRect()
          return (
            target.top >= outer.top - 2 && target.bottom <= outer.bottom + 2
          )
        })
        await page.goBack()
        await expectSelectedDocumentInTree(page, sourcePath)
        await page.goto(selectedURL)
        await page.getByText('结构检查通过', { exact: true }).waitFor()
        await search.fill('没有匹配结果的任务')
        await search.press('Enter')
        await page.getByText('没有匹配的 Skill', { exact: true }).waitFor()
        assert.equal(
          await page
            .getByRole('link', { name: '查看原文', exact: true })
            .count(),
          0
        )
        await search.locator('xpath=..')
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelector('input[aria-label="搜索任务或 Skill"]')
              ?.value === ''
        )
        assert.equal(await search.inputValue(), '')
        await page.goto(
          new URL('/__dev/project-skills?skill=missing-skill', page.url()).href
        )
        await page
          .getByText('所选 Skill 已不存在或不符合当前搜索', { exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '返回当前结果', exact: true })
          .click()
        await page
          .getByRole('link', { name: '查看原文', exact: true })
          .waitFor()
        const endpoint = '**/__dev/api/project-skills'
        await page.route(endpoint, (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...snapshot,
              health: { status: 'failed', errors: ['Skill 引用章节不存在'] },
            }),
          })
        )
        await page
          .getByRole('button', { name: '刷新与检查', exact: true })
          .click()
        await page.getByText('结构检查需处理', { exact: true }).waitFor()
        await page.getByText('Skill 引用章节不存在', { exact: true }).waitFor()
        await page.unroute(endpoint)
        await page.route(endpoint, (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{}',
          })
        )
        await page
          .getByRole('button', { name: '刷新与检查', exact: true })
          .click()
        await page
          .getByText('项目 Skill 暂时无法读取', { exact: true })
          .waitFor()
        assert.equal(
          await page.getByText('结构检查通过', { exact: true }).count(),
          0
        )
        await page.unroute(endpoint)
        await page
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await page.getByText('结构检查通过', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, '项目 Skill')
      },
    },
  ]
}
