import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_ADMIN_SYSTEM_NAME,
  ERP_BRAND_MARK,
  ERP_COMPANY_NAME,
  getActiveERPBrand,
} from './brand.js'

test('brand: 默认品牌保持产品中性，不包含客户公司名', () => {
  const previousWindow = global.window
  delete global.window

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: ERP_BRAND_MARK,
      companyName: ERP_COMPANY_NAME,
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

test('brand: yoyoosun 客户 key 只通过客户配置覆盖品牌', () => {
  const previousWindow = global.window
  global.window = {
    __PLUSH_ERP_CUSTOMER_KEY__: 'yoyoosun',
  }

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: '永',
      companyName: '东莞市永绅玩具有限公司',
      systemName: '毛绒 ERP 管理后台',
    })
  } finally {
    if (previousWindow === undefined) {
      delete global.window
    } else {
      global.window = previousWindow
    }
  }
})

test('brand: runtime config can override bundled customer brand', () => {
  const previousWindow = global.window
  global.window = {
    __PLUSH_ERP_CUSTOMER_CONFIG__: {
      customerKey: 'yoyoosun',
      brand: {
        brandMark: '测',
        companyName: '测试客户',
        systemName: '测试 ERP',
      },
    },
  }

  try {
    assert.deepEqual(getActiveERPBrand(), {
      brandMark: '测',
      companyName: '测试客户',
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
