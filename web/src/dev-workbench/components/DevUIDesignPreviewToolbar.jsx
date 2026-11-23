import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Dropdown, Space } from 'antd'
import { CloseOutlined, DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined, ReloadOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import Select from '@/common/components/select/AppSelect'
import AnchoredControlPopover from '@/common/components/overlay/AnchoredControlPopover'
import { DEV_TASK_HANDLING_ROUTE } from '../config/devRoutes.mjs'

const MIN_INLINE_TOOLBAR_WIDTH = 1040
const selectContainer = (trigger) => trigger.parentElement
const toolbarPopupContainer = (trigger) => trigger.closest('.erp-dev-ui-design-reader.is-fullscreen, .erp-dev-ui-design-page')

export default function DevUIDesignPreviewToolbar({
  mobile, scene, ready, onSceneChange, children, fullscreen, fullscreenButtonRef, onFullscreen, onReset, onDownload,
}) {
  const toolbar = useRef(null)
  const settingsButton = useRef(null)
  const moreButton = useRef(null)
  const settings = useRef(null)
  const [compact, setCompact] = useState(false)
  const [popup, setPopup] = useState(null)
  const navigate = useNavigate()

  useLayoutEffect(() => {
    if (!mobile) return undefined
    const element = toolbar.current
    const measure = () => {
      const narrow = element.clientWidth < MIN_INLINE_TOOLBAR_WIDTH
      setCompact(narrow)
      if (!narrow) setPopup(null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mobile])

  const dismissPopup = useCallback(() => {
    const trigger = popup === 'settings' ? settingsButton : moreButton
    setPopup(null)
    trigger.current?.focus({ preventScroll: true })
  }, [popup])

  useEffect(() => {
    if (!popup) return undefined
    // 点进独立的手机文档时，宿主收不到该次 pointerdown。
    const dismiss = () => setPopup(null)
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      dismissPopup()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', dismiss)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', dismiss)
    }
  }, [popup, dismissPopup])

  const changePopup = (name, open) => {
    setPopup((current) => {
      if (open) return name
      return current === name ? null : current
    })
  }
  const actions = [
    { key: 'reset', label: '重置演示', icon: <ReloadOutlined />, onClick: onReset },
    { key: 'download', label: '下载 HTML', icon: <DownloadOutlined />, onClick: onDownload },
  ]
  const actionButtons = actions.map(({ key, ...action }) => (
    <Button key={key} icon={action.icon} onClick={action.onClick}>{action.label}</Button>
  ))
  const fullscreenLabel = fullscreen ? '退出全屏' : compact ? '全屏' : '全屏预览'
  const fullscreenButton = (
    <Button ref={fullscreenButtonRef} aria-label={fullscreenLabel} icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={onFullscreen}>
      {fullscreenLabel}
    </Button>
  )
  if (!mobile) {
    return (
      <div className="erp-dev-ui-design-toolbar"><Space wrap>{children}{actionButtons}{fullscreenButton}</Space></div>
    )
  }

  const fields = (
    <div className="erp-dev-ui-design-scene" role="group" aria-label="手机预览场景">
      <Select
        label="预览身份"
        className="erp-dev-ui-design-scope-select"
        allowClear={false /* 不可清空：手机演示必须绑定一个预览身份。 */}
        virtual={false}
        popupMatchSelectWidth
        disabled={!ready || !scene}
        value={scene?.identity}
        options={scene?.identities}
        getPopupContainer={selectContainer}
        onChange={(value) => onSceneChange('identity', value)}
      />
      {scene?.role !== null && (
        <Select
          label="预览岗位"
          className="erp-dev-ui-design-scope-select"
          allowClear={false /* 不可清空：普通岗位场景必须指定办理岗位。 */}
          virtual={false}
          popupMatchSelectWidth
          disabled={!ready || !scene}
          value={scene?.role}
          options={scene?.roles.map((role) => ({ label: role, value: role }))}
          getPopupContainer={selectContainer}
          onChange={(value) => onSceneChange('role', value)}
        />
      )}
      {children}
    </div>
  )
  const current = scene?.role ?? scene?.identities.find(({ value }) => value === scene.identity)?.label
  const supportLabel = '设备支持范围'
  return (
    <div
      ref={toolbar}
      className="erp-dev-ui-design-toolbar erp-dev-ui-design-mobile-toolbar"
      role="group"
      aria-label="手机版预览工具栏"
    >
      {compact ? (
        <AnchoredControlPopover
          trigger="click"
          placement="bottomLeft"
          open={popup === 'settings'}
          destroyOnHidden
          getPopupContainer={toolbarPopupContainer}
          onOpenChange={(open) => changePopup('settings', open)}
          afterOpenChange={(open) => { if (open) settings.current?.querySelector('[role="combobox"]')?.focus({ preventScroll: true }) }}
          content={(
            <section ref={settings} role="dialog" aria-label="预览设置" className="erp-dev-ui-design-settings">
              <header>
                <strong>预览设置</strong>
                <Button type="text" size="small" icon={<CloseOutlined />} aria-label="收起预览设置" onClick={dismissPopup} />
              </header>
              {fields}
            </section>
          )}
        >
          <Button ref={settingsButton} aria-haspopup="dialog" aria-expanded={popup === 'settings'} className="erp-dev-ui-design-settings-trigger">
            预览设置{current && <span className="erp-dev-ui-design-scene-label"> · {current}</span>}
          </Button>
        </AnchoredControlPopover>
      ) : fields}
      <div className="erp-dev-ui-design-preview-actions">
        {!compact && (
          <>
            <Link to={DEV_TASK_HANDLING_ROUTE}>{supportLabel}</Link>
            {actionButtons}
          </>
        )}
        {fullscreenButton}
        {compact && (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            open={popup === 'more'}
            autoFocus
            destroyOnHidden
            getPopupContainer={toolbarPopupContainer}
            onOpenChange={(open) => changePopup('more', open)}
            menu={{ items: [{ key: 'devices', label: supportLabel, onClick: () => navigate(DEV_TASK_HANDLING_ROUTE) }, ...actions] }}
          >
            <Button ref={moreButton} aria-label="更多" aria-haspopup="menu" aria-expanded={popup === 'more'}>更多</Button>
          </Dropdown>
        )}
      </div>
    </div>
  )
}
