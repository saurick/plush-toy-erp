import assert from 'node:assert/strict'

async function assertPermissionSectionVisualSeparation(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const tabNav = document.querySelector('.erp-permission-tabs .ant-tabs-nav')
    const adminSection = document.querySelector(
      '.erp-permission-section--admins'
    )
    const roleSection = document.querySelector('.erp-permission-section--roles')
    const read = (node) => {
      if (!node) return null
      const style = window.getComputedStyle(node)
      const beforeStyle = window.getComputedStyle(node, '::before')
      const rect = node.getBoundingClientRect()
      const beforeContent = beforeStyle.content || ''
      const beforeHeight = Number.parseFloat(beforeStyle.height || '0')
      return {
        top: rect.top,
        background: style.background,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        topAccentVisible:
          beforeHeight > 1 &&
          beforeContent !== 'none' &&
          beforeContent !== 'normal',
      }
    }
    return {
      hasTabNav: Boolean(tabNav),
      admin: read(adminSection),
      role: read(roleSection),
    }
  })
  assert(
    metrics.hasTabNav && metrics.role,
    `${scenarioName} 未找到权限管理 tab 或默认角色模板模块: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.role.borderColor && metrics.role.background,
    `${scenarioName} 默认角色模板模块缺少可读边框或背景: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.role.topAccentVisible,
    `${scenarioName} tab 化后角色模板模块不应再显示顶部强调线: ${JSON.stringify(metrics)}`
  )
}

async function assertPermissionChecklistItemLayout(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const checklist = document.querySelector('.erp-permission-checklist')
    const wrappers = [
      ...document.querySelectorAll(
        '.erp-permission-list .erp-permission-row.ant-checkbox-wrapper'
      ),
    ].slice(0, 8)
    const bodyText = document.body.textContent || ''
    const readWrapper = (wrapper) => {
      const label = wrapper.querySelector('.erp-permission-row__label')
      const content = wrapper.querySelector('.erp-permission-row__content')
      const wrapperRect = wrapper.getBoundingClientRect()
      const labelRect = label?.getBoundingClientRect()
      return {
        text: String(wrapper.textContent || '').trim(),
        kind: content?.dataset?.permissionKind || '',
        wrapperWidth: wrapperRect.width,
        wrapperScrollWidth: wrapper.scrollWidth,
        wrapperHeight: wrapperRect.height,
        labelWidth: labelRect?.width || 0,
        hasVisiblePermissionKey: Boolean(
          wrapper.querySelector('.erp-permission-row__key')
        ),
      }
    }
    return {
      checklistScrollWidth: checklist?.scrollWidth || 0,
      checklistClientWidth: checklist?.clientWidth || 0,
      wrapperCount: wrappers.length,
      hasRetiredPermissionKey: bodyText.includes('erp.help_center.read'),
      wrappers: wrappers.map(readWrapper),
    }
  })
  assert(
    metrics.wrapperCount > 0,
    `${scenarioName} 未找到权限复选项: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.hasRetiredPermissionKey,
    `${scenarioName} 不应显示已退出的旧权限码: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.checklistScrollWidth <= metrics.checklistClientWidth + 1,
    `${scenarioName} 权限项列表出现横向溢出: ${JSON.stringify(metrics)}`
  )
  const invalid = metrics.wrappers.filter(
    (item) =>
      item.labelWidth <= 0 ||
      !['menu', 'action'].includes(item.kind) ||
      item.wrapperHeight < 48 ||
      item.hasVisiblePermissionKey ||
      item.wrapperScrollWidth > item.wrapperWidth + 1
  )
  assert(
    invalid.length === 0,
    `${scenarioName} 功能名称布局异常或仍展示技术权限码: ${JSON.stringify(metrics)}`
  )
}
export {
  assertPermissionSectionVisualSeparation,
  assertPermissionChecklistItemLayout,
}
