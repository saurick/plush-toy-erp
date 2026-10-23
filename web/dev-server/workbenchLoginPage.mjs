import { createHash } from 'node:crypto'
import {
  ERP_ACCENTS,
  WORKBENCH_APPEARANCE_STORAGE_KEY,
  normalizeERPAccountAppearance,
} from '../src/common/theme/erpAppearance.mjs'
import { ERP_DARK_PALETTE, getERPSurfaceTokens } from '../src/common/theme/erpThemePalette.mjs'

const defaults = normalizeERPAccountAppearance(null)
const defaultAccent = ERP_ACCENTS[defaults.accent]
const light = getERPSurfaceTokens(false)

function initializeAppearance({ key, defaults, accents, surfaces, onDarkAccent }) {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const update = () => {
    let saved
    try { saved = JSON.parse(window.localStorage.getItem(key) || '{}') } catch { saved = null }
    const accentKey = Object.hasOwn(accents, saved?.accent) ? saved.accent : defaults.accent
    const mode = ['light', 'dark', 'system'].includes(saved?.theme_mode) ? saved.theme_mode : defaults.theme_mode
    const dark = mode === 'dark' || (mode === 'system' && media.matches)
    const accent = accents[accentKey]
    const surface = surfaces[dark ? 'dark' : 'light']
    root.dataset.erpTheme = dark ? 'dark' : 'light'
    root.dataset.erpThemeMode = mode
    root.dataset.erpAccent = accentKey
    root.style.colorScheme = dark ? 'dark' : 'light'
    const variables = {
      '--erp-primary': dark ? accent.dark : accent.primary,
      '--erp-primary-strong': dark ? accent.dark : accent.strong,
      '--erp-primary-hover': dark ? accent.darkHover : accent.hover,
      '--erp-on-accent': dark ? onDarkAccent : accent.onPrimary,
      '--erp-page-bg': surface.colorBgLayout,
      '--erp-surface-bg': surface.colorBgContainer,
      '--erp-border': surface.colorBorder,
      '--erp-text': surface.colorText,
      '--erp-text-muted': surface.colorTextSecondary,
    }
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value)
  }
  update()
  media.addEventListener('change', update)
  window.addEventListener('storage', (event) => { if (event.key === key || event.key === null) update() })
}

const appearanceScript = `(${initializeAppearance.toString()})(${JSON.stringify({
  key: WORKBENCH_APPEARANCE_STORAGE_KEY,
  defaults,
  accents: ERP_ACCENTS,
  surfaces: { light, dark: getERPSurfaceTokens(true) },
  onDarkAccent: ERP_DARK_PALETTE.onAccent,
})})`
const scriptHash = createHash('sha256').update(appearanceScript).digest('base64')
export const WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY = `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`

const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

export function renderWorkbenchLoginPage(returnTo, error = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" type="image/svg+xml" href="/favicon-dev.svg"><title>登录 · 研发效能工作台</title><style>
:root {
  --erp-primary: ${defaultAccent.primary};
  --erp-primary-strong: ${defaultAccent.strong};
  --erp-primary-hover: ${defaultAccent.hover};
  --erp-on-accent: ${defaultAccent.onPrimary};
  --erp-page-bg: ${light.colorBgLayout};
  --erp-surface-bg: ${light.colorBgContainer};
  --erp-border: ${light.colorBorder};
  --erp-text: ${light.colorText};
  --erp-text-muted: ${light.colorTextSecondary};
  --erp-primary-soft: color-mix(in srgb, var(--erp-primary) 13%, var(--erp-surface-bg));
  --erp-focus-ring: color-mix(in srgb, var(--erp-primary) 25%, transparent);
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; background: var(--erp-page-bg); color: var(--erp-text); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
main { width: 100%; max-width: 420px; padding: 40px; background: var(--erp-surface-bg); border: 1px solid var(--erp-border); border-radius: 16px; box-shadow: 0 12px 40px rgb(0 0 0 / 4%); }
.mark { display: grid; place-items: center; width: 44px; height: 44px; background: var(--erp-primary-soft); color: var(--erp-primary-strong); border-radius: 12px; font-size: 22px; font-weight: 600; }
h1 { font-size: 24px; line-height: 1.4; margin: 24px 0 8px; }
p { margin: 0 0 28px; color: var(--erp-text-muted); }
label { display: block; margin: 18px 0 7px; font-weight: 500; }
input, button { width: 100%; font: inherit; border-radius: 8px; min-height: 44px; }
input { border: 1px solid var(--erp-border); padding: 9px 12px; color: var(--erp-text); background: var(--erp-surface-bg); }
input:focus-visible, button:focus-visible { outline: 3px solid var(--erp-focus-ring); outline-offset: 2px; border-color: var(--erp-primary); }
button { border: 0; margin-top: 26px; padding: 10px 16px; background: var(--erp-primary); color: var(--erp-on-accent); font-weight: 600; cursor: pointer; }
button:hover { background: var(--erp-primary-hover); }
.error { margin: 18px 0 0; color: #b42318; background: #fef3f2; padding: 10px 12px; border-radius: 8px; }
[data-erp-theme='dark'] .error { color: #fda4af; background: #2a1519; }
.hint { font-size: 14px; margin: 22px 0 0; color: var(--erp-text-muted); }
</style><script id="workbench-appearance">${appearanceScript}</script></head><body><main><div class="mark" aria-hidden="true">&lt;/&gt;</div><h1>研发效能工作台</h1><p>登录后查看项目、验证与交付情况</p><form method="post" action="/__dev/auth/login"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><label for="username">运维账号</label><input id="username" name="username" autocomplete="username" maxlength="64" required autofocus><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}<button type="submit">登录工作台</button></form><p class="hint">请使用工作台专用账号</p></main></body></html>`
}
