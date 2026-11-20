import { getBusinessModule } from './businessModules.mjs'

// 单对象入口用于协同任务来源解析。
export const dashboardModules = Object.freeze(
  ['customers', 'suppliers', 'sales-orders'].map((key) => {
    const { title, path } = getBusinessModule(key)
    return Object.freeze({ key, title, path })
  })
)
