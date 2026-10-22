import { chooseSelectOption } from './selectControlActions.mjs'
import { DESIGN_TASKS, WORK_CENTER_DESIGN_TOPICS } from '../../src/dev-workbench/config/devWorkCenterDesign.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'

export function createDevWorkCenterDesignScenarios({ assert, assertNoHorizontalOverflow }) {
  const businessRequests = new WeakMap()
  const watchBusinessRequests = async (page) => {
    const requests = []
    businessRequests.set(page, requests)
    page.on('request', (request) => {
      if (/\/(?:rpc|jsonrpc)(?:\/|\?|$)/u.test(request.url())) requests.push(new URL(request.url()).pathname)
    })
  }
  return [
    {
      name: 'dev-ui-design-work-center-explanations',
      path: '/__dev/ui-design?view=specification&topic=task-cards',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: watchBusinessRequests,
      verify: async (page) => {
        const guide = page.getByRole('region', { name: '工作中心界面说明', exact: true })
        await guide.waitFor()
        assert.equal(await page.locator('.erp-dev-ui-design-header').getByRole('tab').count(), 3)
        assert.equal(await page.getByRole('tab', { name: '字段图解', exact: true }).count(), 0)
        assert.equal(await page.locator('iframe').count(), 0)
        for (const topic of WORK_CENTER_DESIGN_TOPICS) {
          await page.getByRole('navigation', { name: '设计阅读目录' }).getByRole('button', { name: topic.title, exact: true }).click()
          await guide.locator(`[data-design-point="${topic.points[0].key}"].is-selected`).first().waitFor()
          const preview = guide.getByRole('figure', { name: '界面信息示意' })
          const explanation = guide.getByRole('complementary', { name: '当前界面解释' })
          assert.equal(await explanation.getByRole('heading', { level: 3 }).count(), 1)
          assert.equal(await preview.locator('input:not([type="radio"]), textarea, select').count(), 0, '说明不另造一张表单')
          for (const [index, point] of topic.points.entries()) {
            const name = `${index + 1} ${point.title}`
            await preview.getByRole('button', { name, exact: true }).click()
            await explanation.getByRole('heading', { name, exact: true }).waitFor()
            await explanation.getByText(point.why, { exact: true }).waitFor()
            await explanation.getByText(point.when, { exact: true }).waitFor()
          }
          await explanation.getByRole('button').first().click()
          await preview.locator(`[data-design-point="${topic.points[0].key}"].is-selected`).first().waitFor()
          if (topic.devices.length > 1) {
            await guide.getByText('手机版', { exact: true }).click()
            await guide.locator('.erp-wc-figure.is-mobile').waitFor()
            await assertNoHorizontalOverflow(page, `${topic.key}-mobile`)
            if (topic.key === 'task-cards') {
              const common = DESIGN_TASKS.filter((task) => task.group === 'common')
              assert.equal(await guide.locator('[data-design-task-case]').count(), 5)
              assert.deepEqual(await guide.locator('.erp-wc-task-title').allTextContents(), common.map((task) => task.task_name))
              const noObject = guide.locator('[data-design-task-case="task"]')
              await noObject.getByText('未关联产品／物料', { exact: true }).waitFor()
              assert.match(await noObject.locator('.erp-wc-card-footer').innerText(), /财务 · 待领取/u)
              await noObject.getByText('未设置截止', { exact: true }).waitFor()
              assert.equal(await noObject.locator('.erp-task-identity__code').count(), 0)
              const boxes = await guide.locator('.erp-wc-task-card').evaluateAll((cards) => cards.map((card) => {
                const rect = card.getBoundingClientRect()
                const offset = (selector) => card.querySelector(selector).getBoundingClientRect().top - rect.top
                return { height: rect.height, imageSize: card.querySelector('.erp-task-product-image').getBoundingClientRect().width, association: card.querySelector('.erp-task-identity__card-body').getBoundingClientRect().height, source: offset('.erp-wc-source'), footer: offset('.erp-wc-card-footer') }
              }))
              for (const key of ['height', 'source', 'footer']) assert(Math.max(...boxes.map((box) => box[key])) - Math.min(...boxes.map((box) => box[key])) <= 1, `工作台 ${key} 保持一致：${JSON.stringify(boxes)}`)
              assert(boxes.every((box) => box.association >= 64 && box.imageSize === 64))
              await guide.locator('[data-design-task-case="multi"]').getByRole('button', { name: '查看3 款产品', exact: true }).click()
              const dialog = page.getByRole('dialog', { name: '关联产品', exact: true })
              await dialog.getByText('示例草莓小熊', { exact: true }).waitFor()
              assert.equal(await dialog.locator('.erp-task-identity__row').count(), 3)
              await assertTaskCopy(page, dialog.getByRole('button', { name: '复制产品编号', exact: true }).first(), 'DEMO-CP-001')
              await page.waitForFunction(() => document.activeElement?.closest('.ant-modal-wrap')?.querySelector('.erp-task-linked-items-modal'), null, { timeout: 5000 })
              await page.keyboard.press('Escape')
              await dialog.waitFor({ state: 'hidden' })
              await guide.getByText('异常与缺值', { exact: true }).click()
              await guide.locator('[data-design-task-case="blocked"]').getByText('产品编号未填写', { exact: true }).waitFor()
              await guide.locator('[data-design-task-case="customer"]').getByText('产品名称未填写', { exact: true }).waitFor()
              assert.match(await guide.locator('[data-design-task-case="customer"]').innerText(), /已指定办理人/u)
              assert.equal(await guide.locator('[data-design-task-case="unavailable"]').getByText('关联单据已不可用', { exact: true }).count(), 1)
              const ended = guide.locator('[data-design-task-case="ended-undated"]')
              await ended.getByText('结束时间未记录', { exact: true }).waitFor()
              assert.equal(await ended.locator('time, .erp-task-timing__row--danger').count(), 0)
              await guide.locator('[data-design-task-case="invalid-date"]').getByText('时间待核对', { exact: true }).waitFor()
              const colors = await guide.evaluate((node) => ({ danger: getComputedStyle(node.querySelector('.erp-wc-danger')).color, normal: getComputedStyle(node.querySelector('.erp-wc-secondary')).color }))
              assert.notEqual(colors.danger, colors.normal)
              await guide.getByText('常规条目', { exact: true }).click()
            }
            if (topic.key === 'work-progress') {
              const missing = guide.locator('.erp-wc-progress-card').last()
              for (const label of ['未关联产品／物料', '单据编号未提供', '未定交期', '关联待核对', '业务负责人未提供']) await missing.getByText(label, { exact: true }).waitFor()
              assert.match(await missing.locator('.erp-progress-customer').innerText(), /^客户未填写/u)
              const gaps = await guide.locator('.erp-wc-progress-card').evaluateAll((cards) => cards.map((card) => card.querySelector('.mobile-progress-task-entry').getBoundingClientRect().top - card.querySelector('.erp-progress-delivery').getBoundingClientRect().bottom))
              assert(gaps.every((gap) => gap >= 0 && gap <= 4.5), `工作台使用同一紧凑间距：${JSON.stringify(gaps)}`)
            }
            await guide.getByText('电脑版', { exact: true }).click()
            await page.locator('[data-design-device="desktop"]').waitFor()
          }
          await assertNoHorizontalOverflow(page, topic.key)
        }
        await page.getByRole('navigation', { name: '设计阅读目录' }).getByRole('button', { name: '任务卡片怎样统一', exact: true }).click()
        await guide.getByText('手机版', { exact: true }).click()
        await guide.getByRole('figure').getByRole('button', { name: '2 产品、编号和关联数量怎样读？', exact: true }).click()
        await guide.getByRole('complementary', { name: '当前界面解释' }).getByRole('button').first().click()
        assert.deepEqual(businessRequests.get(page), [], '初始加载、切换和关联清单不请求业务数据')
      },
    },
    {
      name: 'dev-ui-design-work-center-reading',
      path: '/__dev/ui-design?page=mobile-tasks&view=specification&topic=task-cards',
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: watchBusinessRequests,
      verify: async (page) => {
        const guide = page.getByRole('region', { name: '工作中心界面说明', exact: true })
        await guide.waitFor()
        const explanation = guide.getByRole('complementary', { name: '当前界面解释' })
        await explanation.getByRole('button', { name: '4 任务状态、受阻原因和期限怎样区分？', exact: true }).click()
        await page.reload()
        await guide.locator('[data-design-point="attention"].is-selected').first().waitFor()
        await page.waitForURL((url) => url.searchParams.get('page') === 'mobile-tasks' && url.searchParams.get('point') === 'attention')
        await explanation.getByRole('button').first().click()
        await page.goBack()
        await guide.locator('[data-design-point="attention"].is-selected').first().waitFor()
        await page.goForward()
        await guide.locator('[data-design-point="identity"].is-selected').first().waitFor()
        await explanation.getByRole('link', { name: '查看设计依据', exact: true }).click()
        await page.getByRole('heading', { name: '工作中心布局的取舍 / Work Center Layout Rationale', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('page'), 'mobile-tasks', '依据阅读保留原设备上下文')
        await page.goBack()
        await guide.waitFor()
        assert.equal(await guide.getAttribute('data-design-device'), 'mobile')
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await page.locator('iframe[title="ERP 最新可交互设计"]').waitFor()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await guide.waitFor()
        await verifyMobileNavigationMotion(page, assert, '.erp-dev-ui-design-header .ant-tabs', 0)
        await verifyMobileNavigationMotion(page, assert, '.erp-dev-ui-design-header .ant-tabs', 1)
        await guide.waitFor()
        await assertNoHorizontalOverflow(page, '界面说明恢复阅读')
        assert.deepEqual(businessRequests.get(page), [], '刷新与前进后退不请求业务数据')
      },
    },
    {
      name: 'dev-ui-design-compact-task-items',
      path: '/__dev/ui-design?page=mobile-tasks',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        const phone = frame.locator('.role-mobile-device')
        await phone.getByRole('tab', { name: '流程跟踪', exact: true }).waitFor()
        await chooseSelectOption(frame.getByLabel('预览身份', { exact: true }), 'admin')
        const trigger = phone.getByRole('button', { name: '查看3 款产品', exact: true })
        await trigger.click()
        const list = frame.getByRole('dialog', { name: '任务关联内容', exact: true })
        await list.getByText('冬日长耳兔', { exact: true }).waitFor()
        assert.equal(await list.locator('.rm-card-body').count(), 3)
        await list.getByRole('button', { name: '查看冬日围巾小熊大图', exact: true }).click()
        await frame.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        await list.getByText('冬日长耳兔', { exact: true }).waitFor()
        await list.getByRole('button', { name: '关闭关联清单', exact: true }).click()
        await list.waitFor({ state: 'hidden' })
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true)
        for (let index = 0; index < 2 && !await phone.getByText('未关联产品／物料', { exact: true }).isVisible(); index++) {
          const more = phone.locator('.rm-more')
          if (await more.isVisible()) await more.click()
        }
        const empty = phone.locator('.rm-task-card[data-id="M14"]')
        await empty.getByText('未关联产品／物料', { exact: true }).waitFor()
        await empty.getByText('未设置截止', { exact: true }).waitFor()
        assert.equal(await empty.locator('.task-association-reference').count(), 0)
        const heights = await phone.locator('.rm-task-card[data-id="M01"], .rm-task-card[data-id="M14"]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
        assert(Math.max(...heights) - Math.min(...heights) <= 1, `交互稿常规任务等高：${JSON.stringify(heights)}`)
        const imageSizes = await phone.locator('.rm-task-card .product-thumb, .rm-task-card .rm-card-image').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
        assert(imageSizes.length > 0 && imageSizes.every((size) => size === 64), `交互稿实图和缺图占位尺寸一致：${JSON.stringify(imageSizes)}`)
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
