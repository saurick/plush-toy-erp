export const ERP_APPEARANCE_STORAGE_KEY = 'plush_erp_appearance'

export const ERP_ACCENTS = Object.freeze({
  blue: {
    label: '蓝色',
    primary: '#0a66c2',
    strong: '#0b4f96',
    hover: '#0858aa',
    dark: '#75b9ff',
    onPrimary: '#ffffff',
  },
  green: {
    label: '绿色',
    primary: '#16834f',
    strong: '#0b633a',
    hover: '#0f6e41',
    dark: '#70dfa1',
    onPrimary: '#ffffff',
  },
  yellow: {
    label: '黄色',
    primary: '#f2b515',
    strong: '#755400',
    hover: '#db9f00',
    dark: '#ffd866',
    onPrimary: '#231f13',
  },
  pink: {
    label: '粉色',
    primary: '#c83b82',
    strong: '#98245e',
    hover: '#ac2b6b',
    dark: '#ff91c3',
    onPrimary: '#ffffff',
  },
  orange: {
    label: '橙色',
    primary: '#c74d0d',
    strong: '#943a08',
    hover: '#aa3f08',
    dark: '#ff9b61',
    onPrimary: '#ffffff',
  },
  purple: {
    label: '紫色',
    primary: '#7650c7',
    strong: '#55349c',
    hover: '#6240ad',
    dark: '#b79aff',
    onPrimary: '#ffffff',
  },
})

export function normalizeERPAppearance(value) {
  return {
    accent: Object.hasOwn(ERP_ACCENTS, value?.accent) ? value.accent : 'blue',
    density: value?.density === 'compact' ? 'compact' : 'standard',
  }
}

export function readERPAppearance(storage) {
  try {
    return normalizeERPAppearance(
      JSON.parse(storage?.getItem(ERP_APPEARANCE_STORAGE_KEY) || '{}')
    )
  } catch {
    return normalizeERPAppearance(null)
  }
}
