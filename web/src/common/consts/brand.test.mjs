import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ERP_ADMIN_SYSTEM_NAME,
  ERP_BRAND_MARK,
  ERP_COMPANY_NAME,
  getActiveERPBrand,
} from './brand.js'

test('brand: product runtime does not statically import customer packages', () => {
  const runtimeFiles = [
    new URL('./brand.js', import.meta.url),
    new URL('./favicon.mjs', import.meta.url),
    new URL('../../erp/config/customerMenuConfig.mjs', import.meta.url),
    new URL('../../erp/config/devCustomerConfigRoute.mjs', import.meta.url),
    new URL('../../erp/config/devRoutes.mjs', import.meta.url),
    new URL('../../erp/router.jsx', import.meta.url),
  ]

  runtimeFiles.forEach((fileUrl) => {
    const source = readFileSync(fileUrl, 'utf8')
    assert.equal(source.includes('config/customers/yoyoosun'), false)
    assert.equal(source.includes('yoyoosunMenuConfig'), false)
  })
})

test('brand: 默认品牌保持产品中性，不包含客户公司名', () => {
  const previousWindow = global.window
  delete global.window

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: ERP_BRAND_MARK,
      companyName: ERP_COMPANY_NAME,
      faviconHref: undefined,
      systemName: ERP_ADMIN_SYSTEM_NAME,
    })
    assert.equal(ERP_BRAND_MARK, '绒')
    assert.equal(ERP_COMPANY_NAME, '毛绒玩具 ERP')
    assert.equal(ERP_ADMIN_SYSTEM_NAME, '毛绒 ERP 管理后台')
  } finally {
    if (previousWindow === undefined) {
      delete global.window
    } else {
      global.window = previousWindow
    }
  }
})

test('brand: customer key alone does not load bundled customer brand', () => {
  const previousWindow = global.window
  global.window = {
    __PLUSH_ERP_CUSTOMER_KEY__: 'yoyoosun',
  }

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: ERP_BRAND_MARK,
      companyName: ERP_COMPANY_NAME,
      faviconHref: undefined,
      systemName: ERP_ADMIN_SYSTEM_NAME,
    })
  } finally {
    if (previousWindow === undefined) {
      delete global.window
    } else {
      global.window = previousWindow
    }
  }
})

test('brand: runtime customer config can override neutral product brand', () => {
  const previousWindow = global.window
  global.window = {
    __PLUSH_ERP_CUSTOMER_CONFIG__: {
      customerKey: 'demo',
      brand: {
        brandMark: '测',
        companyName: '测试客户',
        faviconHref: '/favicon-test.svg',
        systemName: '测试 ERP',
      },
    },
  }

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: '测',
      companyName: '测试客户',
      faviconHref: '/favicon-test.svg',
      systemName: '测试 ERP',
    })
  } finally {
    if (previousWindow === undefined) {
      delete global.window
    } else {
      global.window = previousWindow
    }
  }
})
