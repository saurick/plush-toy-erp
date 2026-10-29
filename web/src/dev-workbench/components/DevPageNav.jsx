import React, { useEffect, useRef, useState } from 'react'
import {
  AppstoreOutlined,
  BuildOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, theme } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
  DEV_WORKSPACE_NAV_ITEMS,
  getDevSecondaryNavItems,
  resolveDevNavigationRoute,
  resolveDevWorkbenchAreaKey,
} from '../config/devRoutes.mjs'
import { preloadDevRoute } from '../config/devRouteModules.mjs'

const navIcons = {
  [DEV_WORKBENCH_AREA_KEYS.overview]: <AppstoreOutlined />,
  [DEV_WORKBENCH_AREA_KEYS.productEngineering]: <BuildOutlined />,
  [DEV_WORKBENCH_AREA_KEYS.developmentResources]: <CodeOutlined />,
  [DEV_WORKBENCH_AREA_KEYS.quality]: <SafetyCertificateOutlined />,
  [DEV_WORKBENCH_AREA_KEYS.delivery]: <DeploymentUnitOutlined />,
}
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

export default function DevPageNav({ navRef = null }) {
  const location = useLocation()
  const { token } = theme.useToken()
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
  const currentNavigationRoute = resolveDevNavigationRoute(currentPathname)
  const pendingRouteLabel =
    DEV_PAGE_TITLE_BY_ROUTE[currentPathname] || '目标页面'
  const currentRouteRef = useRef(null)

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
          {DEV_WORKSPACE_NAV_ITEMS.map((area) => (
            <div key={area.key} className="erp-dev-workspace-nav__group">
              <Link
                ref={
                  currentNavigationRoute === area.route ? currentRouteRef : undefined
                }
                to={area.route}
                onPointerEnter={() => handleRoutePreload(area.route)}
                onFocus={() => handleRoutePreload(area.route)}
                onClick={(event) => handleRouteIntent(event, area.route)}
                className={[
                  'erp-dev-workspace-nav__route',
                  currentNavigationRoute === area.route
                    ? 'erp-dev-workspace-nav__route--active'
                    : currentAreaKey === area.key
                      ? 'erp-dev-workspace-nav__route--context'
                      : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={
                  currentNavigationRoute === area.route ? 'page' : undefined
                }
              >
                <span
                  className="erp-dev-workspace-nav__route-mark"
                  aria-hidden="true"
                >
                  {navIcons[area.key]}
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
                    const isActive = currentNavigationRoute === item.route
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
          {import.meta.env.MODE === 'workbench' ? (
            <form method="post" action="/__dev/auth/logout">
              <Button block htmlType="submit">退出登录</Button>
            </form>
          ) : null}
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
