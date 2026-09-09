import assert from 'node:assert/strict'
import path from 'node:path'
import { buildWorkflowTaskBoardMock } from '../../src/mocks/workflowTaskBoardMock.mjs'

const productName = '图片预览模拟长耳兔抱枕（可拆卸围巾礼盒款）'
const previewButtonName = `查看${productName}大图`
const stageSelector = '.erp-task-image-preview__stage'
const mobilePermissions = [
  'mobile.engineering.access',
  'workflow.task.read',
  'product.read',
]
const fixture = {
  id: 990001,
  version: 1,
  task_code: 'STYLE-L1-PREVIEW-001',
  task_name: '核对图片预览样品',
  task_group: 'engineering_check',
  task_status_key: 'blocked',
  blocked_reason: '等待确认样品颜色',
  owner_role_key: 'engineering',
  source_type: 'sales_order',
  source_no: 'SO-PREVIEW-001',
  created_at: 1_900_000_000,
  updated_at: 1_900_000_000,
  payload: {},
  display_context: {
    available: true,
    source_no: 'SO-PREVIEW-001',
    items: [
      {
        kind: 'product',
        product_id: 7,
        image_attachment_id: 8801,
        name: productName,
        code: 'PRODUCT-7',
      },
    ],
  },
}

async function installPreviewImage(page) {
  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON()
    if (body.method !== 'get_task_board' || body.params.limit !== 1) {
      return route.fallback()
    }
    await route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          code: 0,
          message: '',
          data: buildWorkflowTaskBoardMock({
            tasks: [fixture],
            params: body.params,
            snapshotAt: 1_800_000_000,
          }),
        },
      },
    })
  })
  // A large raster makes fit, zoom and drag observable without depending on customer media.
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 900
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#d5e5d9'
    ctx.fillRect(0, 0, 1000, 900)
    ctx.fillStyle = '#748f80'
    for (let y = 0; y < 900; y += 100) {
      for (let x = 0; x < 1000; x += 100) {
        ctx.fillRect(x + 20, y + 20, 60, 60)
      }
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  page.__previewProbe = {
    reads: [],
    fail: false,
    corrupt: false,
    hold: false,
    release: null,
  }
  await page.route('**/rpc/attachment', async (route) => {
    const body = route.request().postDataJSON()
    if (body.method !== 'download_attachment' || body.params.id !== 8801) {
      return route.fallback()
    }
    const probe = page.__previewProbe
    probe.reads.push(body.params.variant || 'original')
    const original = !body.params.variant
    const failed = original && probe.fail
    const content = original && probe.corrupt ? 'bm90LWFuLWltYWdl' : image
    if (original && probe.hold) {
      await new Promise((resolve) => {
        probe.release = resolve
      })
    }
    await route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          code: failed ? 40010 : 0,
          message: failed ? '图片暂不可用' : '',
          data: failed
            ? {}
            : {
                attachment: {
                  id: 8801,
                  owner_type: 'product',
                  owner_id: 7,
                  mime_type: 'image/png',
                  content_base64: content,
                },
              },
        },
      },
    })
  })
}

async function waitImage(page) {
  await page.waitForFunction(
    (selector) =>
      document.querySelector(`${selector} img`)?.naturalWidth === 1000,
    stageSelector
  )
}

async function closePreview(page, button, { escape = false } = {}) {
  const close = page.getByRole('button', { name: '关闭图片预览', exact: true })
  if (escape) await close.press('Escape')
  else await close.click()
  await page.locator(stageSelector).waitFor({ state: 'detached' })
  assert.equal(
    await button.evaluate((node) => node === document.activeElement),
    true,
    '关闭后焦点返回原图按钮'
  )
}

async function assertPreview(
  page,
  button,
  outputDir,
  name,
  { touch = false } = {}
) {
  await button.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => ({ url: location.href, y: scrollY }))
  const details = page.locator(
    '.erp-task-action-drawer:visible, [data-testid="mobile-task-detail-screen"]'
  )
  const detailCount = await details.count()
  const readsBefore = page.__previewProbe.reads.filter(
    (v) => v === 'original'
  ).length
  await button.focus()
  if (touch) {
    const box = await button.boundingBox()
    await page.__previewTouchSession.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ],
    })
    await page.__previewTouchSession.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  } else await button.press('Enter')
  await waitImage(page)
  assert.equal(await details.count(), detailCount, '点图不改变任务详情')
  assert.equal(
    page.__previewProbe.reads.filter((v) => v === 'original').length,
    readsBefore + 1
  )
  const dialog = page.getByRole('dialog', {
    name: `${productName}图片预览`,
    exact: true,
  })
  await dialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const preview = document.querySelector(
      '.erp-task-image-preview .ant-image-preview'
    )
    return (
      preview &&
      getComputedStyle(preview).transform === 'none' &&
      getComputedStyle(preview).opacity === '1'
    )
  })
  await dialog
    .getByRole('button', { name: '关闭图片预览', exact: true })
    .hover()
  if (touch) {
    await dialog
      .getByText('双指缩放 · 放大后拖动', { exact: true })
      .waitFor({ state: 'visible' })
  }
  await page.screenshot({ path: path.join(outputDir, `${name}-open.png`) })
  assert.equal(
    await dialog.getByRole('button').count(),
    4,
    '预览只保留关闭、缩小、适应屏幕和放大'
  )
  const geometry = await page.evaluate((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect()
    const image = document
      .querySelector(`${selector} img`)
      .getBoundingClientRect()
    const header = document
      .querySelector('.erp-task-image-preview__header')
      .getBoundingClientRect()
    const footer = document
      .querySelector('.erp-task-image-preview__footer')
      .getBoundingClientRect()
    const buttons = Array.from(
      document.querySelectorAll('.erp-task-image-preview button')
    ).filter((el) => el.getBoundingClientRect().width > 0)
    return {
      stageTop: rect.top,
      stageBottom: rect.bottom,
      headerBottom: header.bottom,
      footerTop: footer.top,
      imageWidth: image.width,
      stageWidth: rect.width,
      buttons: buttons.map((el) => ({
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
      })),
    }
  }, stageSelector)
  assert.ok(
    geometry.headerBottom <= geometry.stageTop &&
      geometry.stageBottom <= geometry.footerTop,
    JSON.stringify(geometry)
  )
  assert.ok(geometry.imageWidth <= geometry.stageWidth)
  assert.ok(
    geometry.buttons.every((box) => box.w >= 44 && box.h >= 44),
    JSON.stringify(geometry)
  )
  const img = page.locator(`${stageSelector} img`)
  const initial = await img.getAttribute('style')
  await dialog.getByRole('button', { name: '放大图片', exact: true }).click()
  await page.waitForFunction(
    ({ selector, initial }) =>
      document.querySelector(`${selector} img`).getAttribute('style') !==
      initial,
    { selector: stageSelector, initial }
  )
  assert.equal(
    await dialog
      .getByRole('button', { name: '缩小图片', exact: true })
      .isEnabled(),
    true
  )
  await dialog.getByRole('button', { name: '适应屏幕', exact: true }).click()
  await page.waitForFunction(
    ({ selector, initial }) =>
      document.querySelector(`${selector} img`).getAttribute('style') ===
      initial,
    { selector: stageSelector, initial }
  )
  if (touch) {
    const cdp = page.__previewTouchSession
    const box = await img.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const points = (distance) => [
      { id: 1, x: cx - distance, y: cy },
      { id: 2, x: cx + distance, y: cy },
    ]
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(35),
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(90),
    })
    await page.waitForFunction(
      (selector) =>
        new DOMMatrix(
          getComputedStyle(document.querySelector(`${selector} img`)).transform
        ).a > 1.5,
      stageSelector
    )
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: cx, y: cy }],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: cx + 45, y: cy + 25 }],
    })
    await page.waitForFunction(
      (selector) =>
        Math.abs(
          new DOMMatrix(
            getComputedStyle(
              document.querySelector(`${selector} img`)
            ).transform
          ).e
        ) > 10,
      stageSelector
    )
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
  } else {
    await img.hover()
    await page.mouse.wheel(0, -120)
    await page.waitForFunction(
      (selector) =>
        new DOMMatrix(
          getComputedStyle(document.querySelector(`${selector} img`)).transform
        ).a > 1,
      stageSelector
    )
    await page.mouse.down()
    const box = await img.boundingBox()
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 30
    )
    await page.waitForFunction(
      (selector) =>
        Math.abs(
          new DOMMatrix(
            getComputedStyle(
              document.querySelector(`${selector} img`)
            ).transform
          ).e
        ) > 10,
      stageSelector
    )
    await page.mouse.up()
  }
  for (let i = 0; i < 7; i += 1) {
    await page.keyboard.press('Tab')
    assert.equal(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
      true,
      'Tab 焦点不得离开预览'
    )
  }
  await closePreview(page, button, { escape: !touch })
  assert.deepEqual(
    await page.evaluate(() => ({ url: location.href, y: scrollY })),
    before,
    '关闭后保留地址和滚动位置'
  )
}

export function createTaskImagePreviewScenarios({
  outputDir,
  customerRuntimeEffectiveSession,
}) {
  const common = {
    auth: 'admin',
    customerKey: 'yoyoosun',
    effectiveSession: customerRuntimeEffectiveSession,
    workflowTaskFixtures: [fixture],
    beforeNavigate: installPreviewImage,
  }
  return [
    {
      ...common,
      name: 'task-image-preview-desktop',
      path: '/erp/task-board?q=图片预览',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const button = page
          .getByRole('button', { name: previewButtonName, exact: true })
          .first()
        await button.waitFor()
        assert.equal(
          page.__previewProbe.reads.includes('original'),
          false,
          '打开预览前不请求原图'
        )
        await assertPreview(
          page,
          button,
          outputDir,
          'task-image-preview-desktop'
        )
        await page
          .getByRole('button', {
            name: '查看核对图片预览样品详情',
            exact: true,
          })
          .click()
        const drawer = page.locator('.erp-task-action-drawer:visible')
        await drawer.waitFor()
        await assertPreview(
          page,
          drawer.getByRole('button', { name: previewButtonName, exact: true }),
          outputDir,
          'task-image-preview-detail'
        )
        assert.equal(await drawer.isVisible(), true, '关闭图片保留任务详情')
        await drawer.locator('.ant-drawer-close').click()
        for (const [url, name] of [
          [
            '/erp/task-board?q=图片预览&lane=exception',
            'task-image-preview-table',
          ],
          ['/erp/dashboard', 'task-image-preview-workbench'],
          ['/erp/business-dashboard', 'task-image-preview-business'],
        ]) {
          await page.goto(new URL(url, page.url()).href)
          if (url === '/erp/dashboard') {
            await page.getByRole('button', { name: /^阻塞\/逾期，/ }).click()
          }
          await assertPreview(page, button, outputDir, name)
        }
      },
    },
    {
      ...common,
      name: 'task-image-preview-mobile',
      path: '/m/engineering/tasks?keyword=图片预览',
      adminProfile: {
        username: 'style-l1-image-preview',
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: mobilePermissions,
        menus: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: mobilePermissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
      },
      viewport: { width: 390, height: 844 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        await installPreviewImage(page)
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setTouchEmulationEnabled', {
          enabled: true,
          maxTouchPoints: 2,
        })
        page.__previewTouchSession = cdp
      },
      verify: async (page) => {
        const button = page
          .getByRole('button', { name: previewButtonName, exact: true })
          .first()
        await button.waitFor()
        await assertPreview(
          page,
          button,
          outputDir,
          'task-image-preview-mobile',
          { touch: true }
        )
        await page.setViewportSize({ width: 320, height: 640 })
        await assertPreview(
          page,
          button,
          outputDir,
          'task-image-preview-mobile-narrow',
          { touch: true }
        )
        for (const failure of ['fail', 'corrupt']) {
          page.__previewProbe[failure] = true
          await button.click()
          await page
            .getByRole('alert')
            .filter({ hasText: '图片加载失败，请重试' })
            .waitFor()
          assert.equal(
            await page
              .getByRole('button', { name: '放大图片', exact: true })
              .isDisabled(),
            true
          )
          page.__previewProbe[failure] = false
          await page
            .getByRole('button', { name: '重新加载', exact: true })
            .click()
          await waitImage(page)
          await closePreview(page, button)
        }
        page.__previewProbe.hold = true
        const pending = page.waitForRequest(
          (request) =>
            request.url().endsWith('/rpc/attachment') &&
            !request.postDataJSON()?.params?.variant
        )
        await button.click()
        await pending
        await page
          .getByRole('status')
          .filter({ hasText: '正在加载图片' })
          .waitFor()
        await closePreview(page, button)
        const finished = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/attachment') &&
            !response.request().postDataJSON()?.params?.variant
        )
        page.__previewProbe.release()
        await finished
        assert.equal(
          await page.locator(stageSelector).count(),
          0,
          '迟到响应不能重新打开预览'
        )
        page.__previewProbe.hold = false
        await button.click()
        await waitImage(page)
        await closePreview(page, button)
      },
    },
  ]
}
