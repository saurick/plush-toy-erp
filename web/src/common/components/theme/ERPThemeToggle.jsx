import React, { useState } from 'react'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Alert, Button, Modal } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { ERP_THEME_MODE, useERPTheme } from '@/common/theme/erpTheme'
import { ERP_ACCENTS } from '@/common/theme/erpAppearance.mjs'

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

// 明暗切换只改变颜色，弹窗各区域保持相同间距。
const appearanceModalStyles = {
  content: { padding: '20px 24px', border: 0 },
  header: { padding: 0, margin: '0 0 8px', borderBottom: 0 },
  body: { padding: 0 },
  footer: { padding: 0, margin: '12px 0 0', borderTop: 0 },
}

export default function ERPThemeToggle({
  className = '',
  size = 'middle',
  variant = 'button',
  showLabel = false,
  showDensity = true,
}) {
  const {
    themeMode,
    setThemeMode,
    appearance,
    setAppearance,
    appearanceSaving,
    appearanceSaveError,
    retryAppearanceSave,
  } = useERPTheme()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const appearanceTitle = showDensity ? '外观与密度' : '外观设置'
  const saveStatus = (
    <span
      className="erp-appearance-save-status"
      role="status"
      aria-hidden={!appearanceSaving}
    >
      {appearanceSaving ? '正在保存外观设置…' : null}
    </span>
  )
  const modeControl = (
    <fieldset>
      <legend>明暗模式</legend>
      <Segmented
        block
        className="erp-theme-toggle"
        aria-label="主题模式"
        value={themeMode}
        options={themeOptions}
        onChange={setThemeMode}
      />
    </fieldset>
  )
  const settings = (
    <div
      className={`erp-appearance-settings${variant === 'settings' ? ' erp-appearance-settings--mobile' : ''}`}
    >
      {variant === 'settings' ? modeControl : null}
      <fieldset>
        <legend>主题色</legend>
        <div className="erp-appearance-swatches">
          {Object.entries(ERP_ACCENTS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              aria-pressed={appearance.accent === key}
              onClick={() => setAppearance({ accent: key })}
            >
              <i style={{ background: item.primary }} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {variant !== 'settings' ? modeControl : null}
      {variant !== 'settings' && showDensity ? (
        <>
          <fieldset>
            <legend>表格密度</legend>
            <Segmented
              block
              aria-label="表格密度"
              value={appearance.density}
              options={[
                { value: 'standard', label: '标准' },
                { value: 'compact', label: '紧凑' },
              ]}
              onChange={(density) => setAppearance({ density })}
            />
          </fieldset>
          <fieldset>
            <legend>表格线条</legend>
            <Segmented
              block
              aria-label="表格线条"
              value={appearance.tableLines}
              options={[
                { value: 'simple', label: '简洁' },
                { value: 'grid', label: '网格' },
              ]}
              onChange={(tableLines) => setAppearance({ tableLines })}
            />
          </fieldset>
        </>
      ) : null}
      {variant === 'settings' ? saveStatus : null}
      {appearanceSaveError ? (
        <Alert
          type="error"
          message={appearanceSaveError}
          action={
            <Button size="small" onClick={retryAppearanceSave}>
              重试
            </Button>
          }
        />
      ) : null}
    </div>
  )
  const appearanceDialog = (
    <Modal
      open={appearanceOpen}
      title={appearanceTitle}
      width={470}
      styles={appearanceModalStyles}
      onCancel={() => setAppearanceOpen(false)}
      footer={
        <div className="erp-appearance-footer">
          {saveStatus}
          <Button
            type="primary"
            disabled={appearanceSaving}
            onClick={() => setAppearanceOpen(false)}
          >
            关闭
          </Button>
        </div>
      }
    >
      {settings}
    </Modal>
  )

  if (variant === 'settings') return settings

  return (
    <>
      <Button
        aria-label={appearanceTitle}
        aria-haspopup="dialog"
        aria-expanded={appearanceOpen}
        title={appearanceTitle}
        className={`erp-appearance-trigger ${className}`.trim()}
        icon={
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2H12Z" />
            <circle cx="7.5" cy="10" r=".7" />
            <circle cx="9.5" cy="6.5" r=".7" />
            <circle cx="7.5" cy="14" r=".7" />
          </svg>
        }
        size={size}
        onClick={() => setAppearanceOpen(true)}
      >
        {showLabel ? (
          <span className="erp-appearance-trigger__label">
            {appearanceTitle}
          </span>
        ) : null}
      </Button>
      {appearanceDialog}
    </>
  )
}
