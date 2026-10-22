import appearanceContract from '../../../../server/internal/biz/admin_erp_appearance.json' with { type: 'json' }
import { normalizeERPThemeMode } from './erpThemeMode.mjs'

export const ERP_APPEARANCE_STORAGE_KEY = 'plush_erp_appearance'
export const WORKBENCH_APPEARANCE_STORAGE_KEY = 'plush_workbench_appearance'

export const ERP_ACCENTS = Object.freeze({
  blue: {
    label: '蓝色',
    primary: '#0a66c2',
    strong: '#0b4f96',
    hover: '#0858aa',
    dark: '#75b9ff',
    darkHover: '#8ac4ff',
    onPrimary: '#ffffff',
  },
  green: {
    label: '橄榄绿',
    primary: '#5e793e',
    strong: '#49632e',
    hover: '#506a34',
    dark: '#a5bc87',
    darkHover: '#b3c699',
    onPrimary: '#ffffff',
  },
  teal: {
    label: '青绿',
    primary: '#257f7c',
    strong: '#1c6260',
    hover: '#1f6c69',
    dark: '#7ad6cf',
    darkHover: '#8edcd6',
    onPrimary: '#ffffff',
  },
  yellow: {
    label: '橙金',
    primary: '#9b6429',
    strong: '#78501f',
    hover: '#865522',
    dark: '#f1c18b',
    darkHover: '#f3ca9c',
    onPrimary: '#ffffff',
  },
  pink: {
    label: '粉色',
    primary: '#c83b82',
    strong: '#98245e',
    hover: '#ac2b6b',
    dark: '#ff91c3',
    darkHover: '#ffa2cc',
    onPrimary: '#ffffff',
  },
  mauve: {
    label: '藕紫',
    primary: '#a34f91',
    strong: '#7d3b6f',
    hover: '#8e437e',
    dark: '#e4a3d7',
    darkHover: '#e8b1dd',
    onPrimary: '#ffffff',
  },
  orange: {
    label: '橙色',
    primary: '#c74d0d',
    strong: '#943a08',
    hover: '#aa3f08',
    dark: '#ff9b61',
    darkHover: '#ffaa79',
    onPrimary: '#ffffff',
  },
  purple: {
    label: '灰紫',
    primary: '#666582',
    strong: '#50506c',
    hover: '#595872',
    dark: '#bab8dc',
    darkHover: '#c4c3e1',
    onPrimary: '#ffffff',
  },
})

export function normalizeERPAppearance(value) {
  return {
    accent: Object.hasOwn(ERP_ACCENTS, value?.accent)
      ? value.accent
      : appearanceContract.defaults.accent,
    density: appearanceContract.densities.includes(value?.density)
      ? value.density
      : appearanceContract.defaults.density,
    tableLines: appearanceContract.table_lines.includes(value?.tableLines)
      ? value.tableLines
      : appearanceContract.defaults.tableLines,
  }
}

export function normalizeERPAccountAppearance(value) {
  return {
    theme_mode: normalizeERPThemeMode(value?.theme_mode),
    ...normalizeERPAppearance(value),
  }
}

export function isERPAccountAppearance(value) {
  return Boolean(
    value &&
    appearanceContract.theme_modes.includes(value.theme_mode) &&
    appearanceContract.accents.includes(value.accent) &&
    appearanceContract.densities.includes(value.density) &&
    appearanceContract.table_lines.includes(value.tableLines)
  )
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
