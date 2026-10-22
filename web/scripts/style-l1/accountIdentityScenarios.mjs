import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function readIdentity(identity) {
  await identity.waitFor({ state: 'visible' })
  return identity.evaluate((node) => {
    const avatar = node.querySelector('.erp-account-avatar')
    const paint = getComputedStyle(avatar)
    const box = node.getBoundingClientRect()
    return {
      name: node.querySelector('.erp-account-identity__name').textContent,
      account: node.querySelector('.erp-account-identity__username')?.textContent || '',
      roles: node.querySelector('.erp-account-identity__roles').textContent,
      text: avatar.textContent,
      tone: avatar.dataset.tone,
      color: paint.color,
      background: paint.backgroundColor,
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      box: box.toJSON(),
      textFits: [...node.querySelectorAll('.erp-account-identity__copy > *')].every((field) => field.scrollWidth <= field.clientWidth + 1),
    }
  })
}

function assertIdentityFits(identity) {
  assert(identity.scrollWidth <= identity.width + 1, JSON.stringify(identity))
  assert(identity.textFits, JSON.stringify(identity))
  assert(getContrastRatio(parseRgb(identity.color), parseRgb(identity.background)) >= 4.5, JSON.stringify(identity))
}

export function createAccountIdentityScenarios({ customerRuntimeEffectiveSession, outputDir, assertNoHorizontalOverflow }) {
  return [
    { name: 'account-identity-cross-device', themeMode: 'light', displayName: '王小明' },
    { name: 'account-identity-long-dark', themeMode: 'dark', displayName: '跨部门业务与仓储协作岗位的长姓名测试员工王小明' },
    { name: 'account-identity-super-admin', themeMode: 'light', displayName: '', superAdmin: true },
    { name: 'account-identity-missing-name', themeMode: 'light', displayName: '' },
  ].map(({ name, themeMode, displayName, superAdmin = false }) => {
    const profile = {
      id: 1,
      username: superAdmin ? 'admin' : 'warehouse-account-with-long-identifier',
      display_name: displayName,
      is_super_admin: superAdmin,
      permissions: customerRuntimeEffectiveSession.actions,
      roles: superAdmin ? [] : [
        { role_key: 'warehouse', name: '成品仓库主管' },
        { role_key: 'purchase', name: '采购' },
        { role_key: 'engineering', name: '工程' },
      ],
    }
    const roleLabel = `所属岗位：${superAdmin ? '未分配岗位' : '成品仓库主管、采购、工程'}`
    const expectedName = displayName || (superAdmin ? '超级管理员' : '姓名待补录')
    const expectedAvatar = displayName ? '小明' : (superAdmin ? '管理' : '用户')
    return {
      name,
      path: '/erp/business-dashboard',
      auth: 'admin',
      themeMode,
      viewport: { width: 1440, height: 1000 },
      customerKey: 'yoyoosun',
      adminProfile: profile,
      effectiveSession: customerRuntimeEffectiveSession,
      verify: async (page) => {
        const { origin } = new URL(page.url())
        const trigger = page.getByTestId('desktop-account-menu-trigger')
        await trigger.waitFor()
        const compact = await readIdentity(trigger.locator('[data-testid="account-identity"]'))
        assert.equal(compact.name, expectedName)
        assert.equal(compact.text, expectedAvatar)
        assert.equal(await trigger.getAttribute('aria-label'), `账号菜单：${expectedName}`)
        await trigger.click()
        const full = page.locator('.erp-account-menu__identity [data-testid="account-identity"]')
        const desktop = await readIdentity(full)
        assert.equal(desktop.account, `账号：${profile.username}`)
        assert.equal(desktop.roles, roleLabel)
        assertIdentityFits(desktop)
        assert.equal(desktop.tone, compact.tone)
        const header = await page.locator('.erp-admin-sider__footer').evaluate((node) => {
          const headerBox = node.getBoundingClientRect()
          const button = node.querySelector('[data-testid="desktop-account-menu-trigger"]').getBoundingClientRect()
          return { top: headerBox.top, bottom: headerBox.bottom, buttonTop: button.top, buttonBottom: button.bottom }
        })
        assert(header.buttonTop >= header.top && header.buttonBottom <= header.bottom + 1, JSON.stringify(header))
        const menuPositions = []
        const verifyMenuPosition = async (button, rightSide) => {
          await waitForFiniteAnimations(page)
          const anchor = await button.boundingBox()
          const popup = await page.locator('.erp-account-menu').boundingBox()
          const viewport = page.viewportSize()
          const geometry = { anchor, popup, viewport, rightSide }
          assert(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= viewport.width + 1 && popup.y + popup.height <= viewport.height + 1, JSON.stringify(geometry))
          if (rightSide) {
            assert(Math.abs(popup.x - (anchor.x + anchor.width) - 8) <= 1, `账号菜单应位于按钮右侧并留 8px 间距: ${JSON.stringify(geometry)}`)
            assert(Math.abs(popup.y + popup.height - (anchor.y + anchor.height)) <= 1, `账号菜单应与按钮底边对齐: ${JSON.stringify(geometry)}`)
          }
          menuPositions.push(geometry)
        }
        await verifyMenuPosition(trigger, true)
        await page.setViewportSize({ width: 3840, height: 2160 })
        await verifyMenuPosition(trigger, true)
        await page.screenshot({ path: `${outputDir}/${name}-desktop.png` })
        await page.locator('.erp-account-menu').screenshot({ path: `${outputDir}/${name}-identity.png` })
        await trigger.click()
        await full.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '收起侧边菜单', exact: true }).click()
        await trigger.click()
        await full.waitFor()
        await verifyMenuPosition(trigger, true)
        await page.mouse.move(700, 300)
        await page.locator('.ant-tooltip:visible').waitFor({ state: 'hidden' })
        await page.screenshot({ path: `${outputDir}/${name}-collapsed.png` })
        const popupBox = await page.locator('.erp-account-menu').boundingBox()
        const cropTop = Math.floor(popupBox.y - 12)
        await page.screenshot({
          path: `${outputDir}/${name}-account-corner.png`,
          clip: { x: 0, y: cropTop, width: Math.ceil(popupBox.x + popupBox.width + 16), height: page.viewportSize().height - cropTop },
        })
        await page.setViewportSize({ width: 1280, height: 400 })
        await verifyMenuPosition(trigger, true)
        await trigger.click()
        await full.waitFor({ state: 'hidden' })
        // 同一账号在窄桌面入口仍可展开完整身份。
        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
        await page.getByTestId('drawer-account-menu-trigger').click()
        assertIdentityFits(await readIdentity(full))
        await verifyMenuPosition(page.getByTestId('drawer-account-menu-trigger'), false)
        await assertNoHorizontalOverflow(page, `${name}-desktop-narrow`)
        await page.getByTestId('drawer-account-menu-trigger').click()
        await full.waitFor({ state: 'hidden' })

        await page.goto(`${origin}/m/${superAdmin ? 'all' : 'warehouse'}/tasks`)
        await page.getByTestId('mobile-role-nav-mine').click()
        const mobileIdentity = page.locator('.mobile-mine-panel [data-testid="account-identity"]')
        const mobile = await readIdentity(mobileIdentity)
        assert.deepEqual([mobile.name, mobile.account, mobile.roles, mobile.text, mobile.tone, mobile.color, mobile.background], [desktop.name, desktop.account, desktop.roles, desktop.text, desktop.tone, desktop.color, desktop.background])
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          assertIdentityFits(await readIdentity(mobileIdentity))
          await assertNoHorizontalOverflow(page, `${name}-mobile-${width}`)
        }
        if (superAdmin) {
          await page.locator('.mobile-admin-review .ant-select-selector').click()
          await page.locator('.ant-select-item-option').filter({ hasText: /^仓库$/u }).click()
          await page.waitForURL('**/m/warehouse/tasks')
          assert.equal((await readIdentity(mobileIdentity)).roles, roleLabel)
          assert.equal(await mobileIdentity.getByText('超级管理员', { exact: true }).count(), 1)
        }
        await page.reload()
        await page.getByTestId('mobile-role-nav-mine').click()
        assert.equal((await readIdentity(mobileIdentity)).tone, desktop.tone)
        assert.equal((await readIdentity(mobileIdentity)).roles, roleLabel)
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: `${outputDir}/${name}-mobile.png` })
        await writeFile(`${outputDir}/${name}-metrics.json`, JSON.stringify({ desktop, mobile, header, menuPositions }, null, 2))
      },
    }
  })
}
