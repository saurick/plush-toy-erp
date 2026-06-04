import React from 'react'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button, Dropdown, Segmented, Tooltip } from 'antd'
import { ERP_THEME_MODE, useERPTheme } from '@/common/theme/erpTheme'

const themeOptions = [
  {
    label: (
      <span className="erp-theme-toggle__option">
        <DesktopOutlined aria-hidden="true" />
        <span>跟系统</span>
      </span>
    ),
    value: ERP_THEME_MODE.SYSTEM,
  },
  {
    label: (
      <span className="erp-theme-toggle__option">
        <SunOutlined aria-hidden="true" />
        <span>浅色</span>
      </span>
    ),
    value: ERP_THEME_MODE.LIGHT,
  },
  {
    label: (
      <span className="erp-theme-toggle__option">
        <MoonOutlined aria-hidden="true" />
        <span>暗色</span>
      </span>
    ),
    value: ERP_THEME_MODE.DARK,
  },
]

const themeIconByMode = {
  [ERP_THEME_MODE.SYSTEM]: <DesktopOutlined aria-hidden="true" />,
  [ERP_THEME_MODE.LIGHT]: <SunOutlined aria-hidden="true" />,
  [ERP_THEME_MODE.DARK]: <MoonOutlined aria-hidden="true" />,
}

const themeLabelByMode = {
  [ERP_THEME_MODE.SYSTEM]: '跟系统',
  [ERP_THEME_MODE.LIGHT]: '浅色',
  [ERP_THEME_MODE.DARK]: '暗色',
}

export default function ERPThemeToggle({
  className = '',
  size = 'middle',
  variant = 'segmented',
  showLabel = false,
}) {
  const { themeMode, setThemeMode } = useERPTheme()

  if (variant === 'menu') {
    const menuItems = themeOptions.map((option) => ({
      key: option.value,
      label: option.label,
    }))
    const currentLabel = themeLabelByMode[themeMode] || '主题'
    const button = (
      <Button
        aria-label={`主题模式：${currentLabel}`}
        className={`erp-theme-menu-toggle ${className}`.trim()}
        icon={themeIconByMode[themeMode] || themeIconByMode.system}
        size={size}
      >
        {showLabel ? (
          <span className="erp-theme-menu-toggle__label">{currentLabel}</span>
        ) : null}
      </Button>
    )

    return (
      <Dropdown
        menu={{
          selectedKeys: [themeMode],
          items: menuItems,
          onClick: ({ key }) => setThemeMode(key),
        }}
        placement="bottomRight"
        trigger={['click']}
      >
        {showLabel ? (
          button
        ) : (
          <Tooltip title={`主题：${currentLabel}`}>{button}</Tooltip>
        )}
      </Dropdown>
    )
  }

  return (
    <Segmented
      aria-label="主题模式"
      className={`erp-theme-toggle ${className}`.trim()}
      size={size}
      value={themeMode}
      options={themeOptions}
      onChange={(value) => setThemeMode(value)}
    />
  )
}
