import { areaList } from '@vant/area-data'
import countryNames from 'i18n-iso-countries/langs/zh.json' with { type: 'json' }
import englishNames from 'i18n-iso-countries/langs/en.json' with { type: 'json' }

export const DEFAULT_DELIVERY_COUNTRY = '中国'

const firstName = (name) => (Array.isArray(name) ? name[0] : name)
const countryLabels = {
  CN: '中国大陆',
  HK: '中国香港',
  MO: '中国澳门',
  TW: '中国台湾',
}

export const DELIVERY_COUNTRY_OPTIONS = Object.entries(countryNames.countries)
  .map(([code, name]) => ({
    label: countryLabels[code] || firstName(name),
    value: code === 'CN' ? '中国' : countryLabels[code] || firstName(name),
    searchText: [code, name, englishNames.countries[code], countryLabels[code]]
      .flat()
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }))
  .sort((a, b) => {
    if (a.value === '中国') return -1
    if (b.value === '中国') return 1
    return a.label.localeCompare(b.label, 'zh-CN')
  })

export function isMainlandDeliveryCountry(value) {
  return ['中国', '中国大陆', '中华人民共和国', 'cn', 'chn', 'china'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  )
}

const childrenOf = (list, prefix) =>
  Object.entries(list)
    .filter(([code]) => code.startsWith(prefix))
    .map(([value, label]) => ({ value, label }))

export const MAINLAND_DELIVERY_REGIONS = Object.entries(areaList.province_list)
  .filter(([code]) => Number(code) < 710000)
  .map(([value, label]) => ({
    value,
    label,
    children: childrenOf(areaList.city_list, value.slice(0, 2)).map((city) => {
      const counties = childrenOf(areaList.county_list, city.value.slice(0, 4))
      return counties.length ? { ...city, children: counties } : city
    }),
  }))

const regionsByPath = new Map()

function collectRegions(options, parentPath = [], parentLabels = []) {
  options.forEach(({ value, label, children }) => {
    const path = [...parentPath, value]
    const labels = [...parentLabels, label]
    const prefix = labels.filter((name, i) => name !== labels[i - 1]).join('')
    regionsByPath.set(path.join('/'), { path, prefix })
    if (children) collectRegions(children, path, labels)
  })
}
collectRegions(MAINLAND_DELIVERY_REGIONS)
const regionPrefixes = [...regionsByPath.values()].sort(
  (a, b) => b.prefix.length - a.prefix.length || b.path.length - a.path.length
)

export function deliveryRegionPrefix(path = []) {
  return regionsByPath.get(path.join('/'))?.prefix || ''
}

export function joinDeliveryAddress(path = [], detail = '') {
  return `${deliveryRegionPrefix(path)}${detail}`
}

export function splitDeliveryAddress(value = '', country = '') {
  const text = String(value ?? '')
  // Only exact dictionary prefixes are split. Free-form business addresses
  // remain intact; this helper does not infer or validate a delivery location.
  const region = isMainlandDeliveryCountry(country)
    ? regionPrefixes.find(({ prefix }) => text.startsWith(prefix))
    : undefined
  return {
    path: region?.path || [],
    detail: region ? text.slice(region.prefix.length) : text,
  }
}

export function deliveryAddressRule(country) {
  return {
    validator: async (_, value) => {
      const text = String(value || '')
      if (text.length > 512) throw new Error('完整收货地址不能超过 512 个字符')
      const { path, detail } = splitDeliveryAddress(text, country)
      if (path.length && !detail.trim()) {
        throw new Error('请补充街道、门牌或仓库地址')
      }
    },
  }
}
