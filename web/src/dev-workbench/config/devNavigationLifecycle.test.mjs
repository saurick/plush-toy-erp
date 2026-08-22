import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEV_PAGE_TITLE_BY_ROUTE } from './devRoutes.mjs'

const devPageNavSource = readFileSync(
  new URL('../components/DevPageNav.jsx', import.meta.url),
  'utf8'
)
const devRoutesSource = readFileSync(
  new URL('../DevWorkbenchRoutes.jsx', import.meta.url),
  'utf8'
)
const devRouteModulesSource = readFileSync(
  new URL('./devRouteModules.mjs', import.meta.url),
  'utf8'
)
const devNavigationStyles = readFileSync(
  new URL('../styles/dev-navigation.css', import.meta.url),
  'utf8'
)

test('dev route module registry covers every titled workbench route', () => {
  const lazyRouteRegistrations = [
    ...devRoutesSource.matchAll(
      /createDevLazyRoute\(\s*(DEV_[A-Z_]+_ROUTE)\s*,/gu
    ),
  ].map((match) => match[1])

  assert.equal(
    lazyRouteRegistrations.length,
    Object.keys(DEV_PAGE_TITLE_BY_ROUTE).length
  )
  assert.equal(
    new Set(lazyRouteRegistrations).size,
    lazyRouteRegistrations.length
  )
  assert.match(devRoutesSource, /createDevLazyRoute/u)
  assert.doesNotMatch(devRoutesSource, /lazyWithDynamicImportRetry/u)
  assert.match(devRouteModulesSource, /const routeImporters = new Map\(\)/u)
  assert.match(devRouteModulesSource, /const modulePromises = new Map\(\)/u)
  assert.match(
    devRouteModulesSource,
    /routeImporters\.get\(routePathname\)[\s\S]*modulePromises\.get\(importer\)[\s\S]*loadWithDynamicImportRetry\(importer\)/u
  )
})

test('dev navigation shows the latest route intent while a lazy route is pending', () => {
  assert.match(
    devPageNavSource,
    /const \[navigationIntent, setNavigationIntent\] = useState/u
  )
  assert.match(
    devPageNavSource,
    /navigationIntent\.sourcePathname === routedPathname[\s\S]*navigationIntent\.targetPathname !== routedPathname/u
  )
  assert.match(
    devPageNavSource,
    /const currentPathname = routePending[\s\S]*navigationIntent\.targetPathname[\s\S]*routedPathname/u
  )
  assert.match(devPageNavSource, /aria-busy=\{routePending \|\| undefined\}/u)
  assert.equal(
    devPageNavSource.match(
      /onClick=\{\(event\) => handleRouteIntent\(event, item\.route\)\}/gu
    )?.length,
    2
  )
})

test('dev navigation ignores active re-clicks and preserves modified-link behavior', () => {
  assert.match(
    devPageNavSource,
    /function isPlainRouteClick\(event\)[\s\S]*!event\.metaKey[\s\S]*!event\.altKey[\s\S]*!event\.ctrlKey[\s\S]*!event\.shiftKey/u
  )
  assert.match(
    devPageNavSource,
    /if \(targetPathname === currentPathname\) \{[\s\S]*event\.preventDefault\(\)[\s\S]*return/u
  )
  assert.match(
    devPageNavSource,
    /setNavigationIntent\(\{[\s\S]*sourcePathname: routedPathname,[\s\S]*targetPathname,[\s\S]*\}\)/u
  )
})

test('dev navigation clears settled intent before browser history revisits its source', () => {
  assert.match(
    devPageNavSource,
    /const EMPTY_NAVIGATION_INTENT = Object\.freeze\(\{[\s\S]*sourcePathname: '',[\s\S]*targetPathname: '',[\s\S]*\}\)/u
  )
  assert.match(
    devPageNavSource,
    /useEffect\(\(\) => \{[\s\S]*setNavigationIntent\(\(currentIntent\) => \{[\s\S]*const stillPending =[\s\S]*currentIntent\.sourcePathname === routedPathname[\s\S]*currentIntent\.targetPathname !== routedPathname[\s\S]*return stillPending \? currentIntent : EMPTY_NAVIGATION_INTENT[\s\S]*\}\)[\s\S]*\}, \[routedPathname\]\)/u
  )
})

test('browser Back clears a pending target while Forward projects its new target', () => {
  assert.match(
    devPageNavSource,
    /const handleHistoryNavigation = \(\) => \{[\s\S]*const targetPathname = normalizePathname\(window\.location\.pathname\)[\s\S]*targetPathname === routedPathname[\s\S]*EMPTY_NAVIGATION_INTENT[\s\S]*sourcePathname: routedPathname,[\s\S]*targetPathname,/u
  )
  assert.match(
    devPageNavSource,
    /window\.addEventListener\('popstate', handleHistoryNavigation\)[\s\S]*window\.removeEventListener\('popstate', handleHistoryNavigation\)/u
  )
})

test('dev navigation preloads visible routes at idle and on direct interaction', () => {
  assert.match(devPageNavSource, /window\.requestIdleCallback/u)
  assert.match(devPageNavSource, /timeout: 350/u)
  assert.equal(
    devPageNavSource.match(
      /onPointerEnter=\{\(\) => handleRoutePreload\(item\.route\)\}/gu
    )?.length,
    2
  )
  assert.equal(
    devPageNavSource.match(
      /onFocus=\{\(\) => handleRoutePreload\(item\.route\)\}/gu
    )?.length,
    2
  )
})

test('pending route hides stale content behind a target-specific loading surface', () => {
  assert.match(
    devPageNavSource,
    /DEV_PAGE_TITLE_BY_ROUTE\[currentPathname\] \|\| '目标页面'/u
  )
  assert.match(devPageNavSource, /className="erp-dev-route-transition"/u)
  assert.match(devPageNavSource, /title=\{`正在打开\$\{pendingRouteLabel\}`\}/u)
  assert.match(devPageNavSource, /description="菜单仍可继续切换"/u)
  assert.match(
    devNavigationStyles,
    /\.erp-dev-workspace-nav\[aria-busy='true'\][\s\S]*~ :not\(\.erp-dev-route-transition\)[\s\S]*visibility: hidden/u
  )
  assert.match(
    devNavigationStyles,
    /\.erp-dev-route-transition \{[\s\S]*position: fixed;[\s\S]*z-index: 20;/u
  )
})
