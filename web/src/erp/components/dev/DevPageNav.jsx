import React, { useMemo } from 'react'
import { CopyOutlined, FileTextOutlined, HomeOutlined } from '@ant-design/icons'
import { Button, theme } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import {
  DEV_DOCS_ROUTE,
  DEV_HUB_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../config/devRoutes.mjs'

const COPY_MESSAGE_KEY = 'dev-page-nav-copy-deep-link'

export default function DevPageNav({ sourcePath = '', navRef = null }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const currentPathname =
    location.pathname === '/'
      ? location.pathname
      : location.pathname.replace(/\/+$/, '')
  const currentDeepLink = useMemo(() => {
    const relativeLink = `${location.pathname}${location.search}${location.hash}`
    if (typeof window === 'undefined') return relativeLink
    return `${window.location.origin}${relativeLink}`
  }, [location.hash, location.pathname, location.search])
  const sourceHref = sourcePath
    ? `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(sourcePath)}`
    : ''

  const handleCopyDeepLink = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      message.warning({
        key: COPY_MESSAGE_KEY,
        content: '当前浏览器不支持复制深链',
      })
      return
    }
    navigator.clipboard
      .writeText(currentDeepLink)
      .then(() =>
        message.success({
          key: COPY_MESSAGE_KEY,
          content: '当前开发页深链已复制',
        })
      )
      .catch(() =>
        message.error({
          key: COPY_MESSAGE_KEY,
          content: '复制失败，请手动复制地址栏链接',
        })
      )
  }

  return (
    <nav
      ref={navRef}
      aria-label="开发页面导航"
      className="erp-dev-workspace-nav"
      style={{
        '--dev-nav-border': token.colorBorder,
        '--dev-nav-bg': token.colorBgContainer,
        '--dev-nav-active-bg': token.colorPrimaryBg,
        '--dev-nav-active-border': token.colorPrimary,
        '--dev-nav-secondary': token.colorTextSecondary,
      }}
    >
      <div className="erp-dev-workspace-nav__brand">
        <span className="erp-dev-workspace-nav__brand-mark" aria-hidden="true">
          D
        </span>
        <span className="erp-dev-workspace-nav__brand-copy">
          <strong>开发工作台</strong>
          <small>开发工作台 / Dev Workspace</small>
        </span>
      </div>
      <div
        className="erp-dev-workspace-nav__routes"
        aria-label="开发工作台页面"
      >
        <button
          type="button"
          className={
            currentPathname === DEV_HUB_ROUTE
              ? 'erp-dev-workspace-nav__route erp-dev-workspace-nav__route--active'
              : 'erp-dev-workspace-nav__route'
          }
          aria-current={currentPathname === DEV_HUB_ROUTE ? 'page' : undefined}
          onClick={() => navigate(DEV_HUB_ROUTE)}
        >
          <HomeOutlined aria-hidden="true" />
          <span>总览</span>
          <small>开发入口与状态</small>
        </button>
        {DEV_WORKSPACE_NAV_ITEMS.map((item) => {
          const isActive = currentPathname === item.route
          return (
            <button
              type="button"
              key={item.route}
              className={
                isActive
                  ? 'erp-dev-workspace-nav__route erp-dev-workspace-nav__route--active'
                  : 'erp-dev-workspace-nav__route'
              }
              aria-current={isActive ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <span
                className="erp-dev-workspace-nav__route-mark"
                aria-hidden="true"
              >
                {item.label.slice(0, 1)}
              </span>
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          )
        })}
      </div>
      <div className="erp-dev-workspace-nav__actions">
        <Button
          block
          icon={<CopyOutlined />}
          aria-label="复制当前开发页深链"
          onClick={handleCopyDeepLink}
        >
          复制深链
        </Button>
        {sourceHref ? (
          <Button
            block
            icon={<FileTextOutlined />}
            aria-label={`在开发文档中打开来源 ${sourcePath}`}
            onClick={() => navigate(sourceHref)}
          >
            来源文档
          </Button>
        ) : null}
        <span className="erp-dev-workspace-nav__boundary">
          仅开发环境 / DEV ONLY · 不进入正式菜单
        </span>
      </div>
    </nav>
  )
}
