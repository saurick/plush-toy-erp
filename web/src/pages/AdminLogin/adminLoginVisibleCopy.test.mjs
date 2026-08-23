import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loginPageSource = readFileSync(
  new URL('./index.jsx', import.meta.url),
  'utf8'
)
const appSource = readFileSync(
  new URL('../../App.jsx', import.meta.url),
  'utf8'
)

test('admin login visible copy uses ordinary work entry language', () => {
  for (const expectedText of [
    '电脑端业务管理',
    '手机端待办',
    '请选择工作方式',
    '当前账号不能使用所选工作方式，请联系系统管理员',
    '暂时无法登录，请联系系统管理员',
  ]) {
    assert.match(loginPageSource, new RegExp(expectedText, 'u'))
  }

  for (const staleText of ['后台管理', '岗位任务端', '登录入口', '入口权限']) {
    assert.doesNotMatch(loginPageSource, new RegExp(staleText, 'u'))
  }
})

test('admin login uses the product name as its only visible heading', () => {
  assert.match(
    loginPageSource,
    /<h1 className="erp-login-logo__title">[\s\S]*?\{activeBrand\.companyName\}[\s\S]*?<\/h1>/u
  )
  assert.doesNotMatch(loginPageSource, /\{activeBrand\.systemName\}/u)
  assert.doesNotMatch(loginPageSource, /erp-login-card__title/u)
})

test('application title fallback uses ordinary Chinese copy', () => {
  assert.match(appSource, /'毛绒玩具管理系统'/u)
  assert.doesNotMatch(appSource, /'Plush Toy ERP'/u)
})
