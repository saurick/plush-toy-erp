import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppstoreOutlined,
  CodeOutlined,
  CopyOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  MoreOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, Popover, theme } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import {
  DEV_DOCS_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
  getDevSecondaryNavItems,
  resolveDevWorkbenchAreaKey,
} from '../config/devRoutes.mjs'
import { preloadDevRoute } from '../config/devRouteModules.mjs'

const COPY_MESSAGE_KEY = 'dev-page-nav-copy-deep-link'
const navIcons = [
  <AppstoreOutlined key="overview" />,
  <CodeOutlined key="product" />,
  <SafetyCertificateOutlined key="quality" />,
  <DeploymentUnitOutlined key="delivery" />,
]
const EMPTY_NAVIGATION_INTENT = Object.freeze({
  sourcePathname: '',
  targetPathname: '',
})

function normalizePathname(pathname) {
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
}

function isPlainRouteClick(event) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  )
}

export default function DevPageNav({ sourcePath = '', navRef = null }) {
  const location = useLocation()
  const { token } = theme.useToken()
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsTriggerRef = useRef(null)
  const routedPathname = normalizePathname(location.pathname)
  const [navigationIntent, setNavigationIntent] = useState(
    EMPTY_NAVIGATION_INTENT
  )
  const routePending =
    navigationIntent.sourcePathname === routedPathname &&
    navigationIntent.targetPathname !== '' &&
    navigationIntent.targetPathname !== routedPathname
  const currentPathname = routePending
    ? navigationIntent.targetPathname
    : routedPathname
  const currentAreaKey = resolveDevWorkbenchAreaKey(currentPathname)
  const pendingRouteLabel =
    DEV_PAGE_TITLE_BY_ROUTE[currentPathname] || '目标页面'
  const currentRouteRef = useRef(null)
  const currentDeepLink = useMemo(() => {
    const relativeLink = routePending
      ? currentPathname
      : `${location.pathname}${location.search}${location.hash}`
    if (typeof window === 'undefined') return relativeLink
    return `${window.location.origin}${relativeLink}`
  }, [
    currentPathname,
    location.hash,
    location.pathname,
    location.search,
    routePending,
  ])
  const sourceHref = sourcePath
    ? `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(sourcePath)}`
    : ''

  useEffect(() => {
    setToolsOpen(false)
  }, [location.key])

  useEffect(() => {
    if (!toolsOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setToolsOpen(false)
      toolsTriggerRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [toolsOpen])

  useEffect(() => {
    setNavigationIntent((currentIntent) => {
      if (!currentIntent.targetPathname) return currentIntent
      const stillPending =
        currentIntent.sourcePathname === routedPathname &&
        currentIntent.targetPathname !== routedPathname
      return stillPending ? currentIntent : EMPTY_NAVIGATION_INTENT
    })
  }, [routedPathname])

  useEffect(() => {
    const handleHistoryNavigation = () => {
      const targetPathname = normalizePathname(window.location.pathname)
      setNavigationIntent(
        targetPathname === routedPathname
          ? EMPTY_NAVIGATION_INTENT
          : {
              sourcePathname: routedPathname,
              targetPathname,
            }
      )
    }

    window.addEventListener('popstate', handleHistoryNavigation)
    return () => window.removeEventListener('popstate', handleHistoryNavigation)
  }, [routedPathname])

  useEffect(() => {
    currentRouteRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [currentPathname])

  const handleCopyDeepLink = () => {
    setToolsOpen(false)
    copyTextToClipboard(currentDeepLink)
      .then(() =>
        message.success({
          key: COPY_MESSAGE_KEY,
          content: '页面链接已复制',
        })
      )
      .catch(() =>
        message.error({
          key: COPY_MESSAGE_KEY,
          content: '复制失败，请手动复制地址栏链接',
        })
      )
  }

  const handleRouteIntent = (event, targetPathname) => {
    if (!isPlainRouteClick(event)) return
    if (targetPathname === currentPathname) {
      event.preventDefault()
      return
    }
    setNavigationIntent({
      sourcePathname: routedPathname,
      targetPathname,
    })
  }

  const handleRoutePreload = (targetPathname) => {
    preloadDevRoute(targetPathname)
  }

  return (
    <>
      <nav
        ref={navRef}
        aria-label="开发页面导航"
        aria-busy={routePending || undefined}
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
          <span
            className="erp-dev-workspace-nav__brand-mark"
            aria-hidden="true"
          >
            <CodeOutlined />
          </span>
          <span className="erp-dev-workspace-nav__brand-copy">
            <strong>研发效能工作台</strong>
          </span>
        </div>
        <div
          className="erp-dev-workspace-nav__routes"
          aria-label="开发工作台页面"
        >
          {DEV_WORKSPACE_NAV_ITEMS.map((area, index) => (
            <div key={area.key} className="erp-dev-workspace-nav__group">
              <Link
                ref={
                  currentPathname === area.route ? currentRouteRef : undefined
                }
                to={area.route}
                onPointerEnter={() => handleRoutePreload(area.route)}
                onFocus={() => handleRoutePreload(area.route)}
                onClick={(event) => handleRouteIntent(event, area.route)}
                className={[
                  'erp-dev-workspace-nav__route',
                  currentPathname === area.route
                    ? 'erp-dev-workspace-nav__route--active'
                    : currentAreaKey === area.key
                      ? 'erp-dev-workspace-nav__route--context'
                      : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={
                  currentPathname === area.route ? 'page' : undefined
                }
              >
                <span
                  className="erp-dev-workspace-nav__route-mark"
                  aria-hidden="true"
                >
                  {navIcons[index]}
                </span>
                <span>{area.label}</span>
              </Link>
              {getDevSecondaryNavItems(area.key).length ? (
                <div
                  className="erp-dev-workspace-nav__secondary"
                  role="group"
                  aria-label={`${area.label}工作入口`}
                >
                  {getDevSecondaryNavItems(area.key).map((item) => {
                    const isActive = currentPathname === item.route
                    return (
                      <Link
                        ref={isActive ? currentRouteRef : undefined}
                        to={item.route}
                        key={item.route}
                        onPointerEnter={() => handleRoutePreload(item.route)}
                        onFocus={() => handleRoutePreload(item.route)}
                        onClick={(event) =>
                          handleRouteIntent(event, item.route)
                        }
                        className={
                          isActive
                            ? 'erp-dev-workspace-nav__secondary-route erp-dev-workspace-nav__secondary-route--active'
                            : 'erp-dev-workspace-nav__secondary-route'
                        }
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="erp-dev-workspace-nav__actions">
          <ERPThemeToggle
            className="erp-dev-workspace-nav__theme-toggle"
            showLabel
          />
          <Popover
            trigger="click"
            placement="rightBottom"
            open={toolsOpen}
            onOpenChange={setToolsOpen}
            content={
              <div className="erp-dev-workspace-nav__tools" role="group" aria-label="页面工具">
                <Button type="text" icon={<CopyOutlined />} aria-label="复制当前页面链接" onClick={handleCopyDeepLink}>
                  复制链接
                </Button>
                {sourceHref ? (
                  <Button type="text" href={sourceHref} icon={<FileTextOutlined />} aria-label={`在开发文档中打开来源 ${sourcePath}`}>
                    来源文档
                  </Button>
                ) : null}
                {import.meta.env.MODE === 'workbench' ? (
                  <form method="post" action="/__dev/auth/logout">
                    <Button block type="text" htmlType="submit">退出登录</Button>
                  </form>
                ) : null}
                <p>开发工具仅供维护使用。运行结果、发布版本与目标环境，以各工具的实际记录为准。</p>
              </div>
            }
          >
            <Button ref={toolsTriggerRef} block icon={<MoreOutlined aria-hidden="true" />} aria-label="页面工具" aria-expanded={toolsOpen}>
              页面工具
            </Button>
          </Popover>
        </div>
      </nav>
      {routePending ? (
        <div
          className="erp-dev-route-transition"
          style={{
            '--dev-route-transition-bg': token.colorBgLayout,
          }}
        >
          <Loading
            title={`正在打开${pendingRouteLabel}`}
            description="菜单仍可继续切换"
            className="erp-dev-route-transition__loading"
          />
        </div>
      ) : null}
    </>
  )
}
