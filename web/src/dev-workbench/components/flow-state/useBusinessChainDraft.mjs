import { useRef, useState } from 'react'
import { emptyBusinessChainDraft, parseBusinessChainDraft } from '../../config/devBusinessChainDesign.mjs'
import { createDevOperationUUID } from '../../config/devOperationIdentity.mjs'
import { showBusinessChainWhole, arrangeBusinessChainMap } from '../../config/devBusinessChainMap.mjs'

export const CHAIN_DESIGN_SAVED_KEY = 'plush-workbench:business-chain-design'
export const CHAIN_DESIGN_WORKING_KEY = 'plush-workbench:business-chain-design:working'

const importedId = 'previous-draft'
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
class DraftError extends Error {}

// New views have reading defaults; restored views retain their stored presentation.
const newBusinessChainView = () => ({
  ...emptyBusinessChainDraft(),
  presentation: { mode: 'mainline', role: '', layout: 'lanes', showBranches: false, layers: ['normal'] },
})

function readDraft(value, library) {
  try { return parseBusinessChainDraft(JSON.stringify(value), library) }
  catch { throw new DraftError('视图内容无法读取，可能已不符合当前链路目录；原存储仍保留。') }
}

function readEntries(library) {
  try {
    const raw = window.localStorage.getItem(CHAIN_DESIGN_SAVED_KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    // The next successful collection write replaces the former single-draft format.
    if (Array.isArray(value?.nodes)) {
      return [{ id: importedId, name: '原有视图', draft: readDraft(value, library) }]
    }
    if (!Array.isArray(value)) throw new Error('Invalid draft collection')
    const ids = new Set()
    for (const item of value) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 ||
        !item.draft || typeof item.draft !== 'object') throw new Error('Invalid draft entry')
      ids.add(item.id)
    }
    return value
  } catch (error) {
    if (error instanceof DraftError) throw error
    throw new DraftError('本地视图列表无法读取，原存储已保留；请先恢复浏览器存储后重试。')
  }
}

function initialState(library, initialRange, startBlank) {
  let entries = []
  let saved = null
  let currentId = null
  let draft = newBusinessChainView()
  let issue = ''
  let workingFound = false
  let initialDraft = null
  try {
    entries = readEntries(library)
    if (!startBlank) {
      saved = entries[0] || null
      currentId = saved?.id || null
      if (saved) draft = readDraft(saved.draft, library)
    }
  } catch (error) { issue = error.message }
  if (startBlank) return { entries, saved, currentId, draft, initialDraft, past: [], future: [], issue }
  try {
    const raw = window.sessionStorage.getItem(CHAIN_DESIGN_WORKING_KEY)
    workingFound = Boolean(raw)
    if (raw) {
      const working = JSON.parse(raw)
      const single = Array.isArray(working?.nodes)
      const id = single ? entries.find((entry) => entry.id === importedId)?.id || null : working.currentId
      if (id !== null && typeof id !== 'string') throw new Error('Invalid working identity')
      draft = readDraft(single ? working : working.draft, library)
      saved = entries.find((entry) => entry.id === id) || null
      currentId = saved?.id || null
      if (id && !saved) issue = '原视图已被删除，当前编辑内容仍保留；可另存一份。'
    }
  } catch { issue = '本标签页的视图无法恢复，原存储已保留；可选择一份本地视图继续。' }
  if (initialRange && !saved && !workingFound && !issue) {
    const mode = initialRange === 'all' ? 'overview' : 'mainline'
    draft = arrangeBusinessChainMap(showBusinessChainWhole(draft, library, initialRange), library, mode, draft.presentation.layout)
    draft.presentation = { ...draft.presentation, mode }
    initialDraft = draft
  }
  return { entries, saved, currentId, draft, initialDraft, past: [], future: [], issue }
}

function persistWorking(state) {
  try {
    window.sessionStorage.setItem(CHAIN_DESIGN_WORKING_KEY, JSON.stringify({ currentId: state.currentId, draft: state.draft }))
    return ''
  } catch { return '本标签页暂存失败，请保持页面打开；刷新可能恢复旧内容，请先保存当前视图。' }
}

export default function useBusinessChainDraft(library, initialRange, startBlank = false) {
  const [state, setState] = useState(() => initialState(library, initialRange, startBlank))
  const current = useRef(state)
  const publish = (next, persist = true) => {
    const value = persist ? { ...next, issue: persistWorking(next) } : next
    current.current = value
    setState(value)
  }
  const failure = (error) => {
    const message = error instanceof DraftError ? error.message : '本地视图保存失败，请保持页面打开并检查浏览器存储空间。'
    publish({ ...current.current, issue: message }, false)
    return { ok: false, error: message }
  }
  const change = (next) => {
    const previous = current.current
    const draft = typeof next === 'function' ? next(previous.draft) : next
    if (equal(draft, previous.draft)) return
    publish({ ...previous, draft, past: [...previous.past.slice(-39), previous.draft], future: [] })
  }
  const changePresentation = (presentation) => {
    const previous = current.current
    const update = (draft) => ({ ...draft, presentation })
    if (equal(previous.draft.presentation, presentation)) return
    // Reading preferences persist with the view without replacing layout undo history.
    publish({ ...previous, draft: update(previous.draft), past: previous.past.map(update), future: previous.future.map(update) })
  }
  const undo = () => {
    const previous = current.current
    if (previous.past.length) publish({ ...previous, draft: previous.past.at(-1), past: previous.past.slice(0, -1), future: [...previous.future, previous.draft] })
  }
  const redo = () => {
    const previous = current.current
    if (previous.future.length) publish({ ...previous, draft: previous.future.at(-1), past: [...previous.past.slice(-39), previous.draft], future: previous.future.slice(0, -1) })
  }
  const requireCurrent = (entries) => {
    const previous = current.current
    const entry = entries.find((item) => item.id === previous.currentId)
    if (!entry || !equal(entry, previous.saved)) {
      throw new DraftError('这份视图已在其他标签页更新或删除。请恢复已保存内容，或另存一份保留当前修改。')
    }
    return entry
  }
  const validName = (name, entries, exceptId) => {
    const normalized = String(name || '').trim()
    if (!normalized || normalized.length > 60) throw new DraftError('请输入 1 至 60 个字的视图名称。')
    if (entries.some((item) => item.id !== exceptId && item.name === normalized)) throw new DraftError('已有同名视图，请换一个名称。')
    return normalized
  }
  const writeEntries = (entries) => window.localStorage.setItem(CHAIN_DESIGN_SAVED_KEY, JSON.stringify(entries))
  const save = (name, copy = false, reading = null) => {
    try {
      const previous = current.current
      const entries = readEntries(library)
      const existing = previous.currentId && !copy ? requireCurrent(entries) : null
      const entry = {
        id: existing?.id || createDevOperationUUID(),
        name: existing?.name || validName(name, entries),
        draft: readDraft(reading ? {
          ...previous.draft,
          presentation: { mode: 'mainline', role: '', ...previous.draft.presentation, ...reading },
        } : previous.draft, library),
      }
      const next = [entry, ...entries.filter((item) => item.id !== entry.id)]
      writeEntries(next)
      publish({ ...previous, entries: next, saved: entry, currentId: entry.id, draft: entry.draft, past: copy ? [] : previous.past, future: copy ? [] : previous.future })
      return { ok: true }
    } catch (error) { return failure(error) }
  }
  const open = (id) => {
    try {
      const entries = readEntries(library)
      const saved = entries.find((item) => item.id === id) || null
      if (id && !saved) throw new DraftError('这份视图已不存在；当前编辑内容仍保留。')
      const draft = saved ? readDraft(saved.draft, library) : newBusinessChainView()
      const next = { entries, saved, currentId: saved?.id || null, draft, past: [], future: [], issue: '' }
      const issue = persistWorking(next)
      if (issue) throw new DraftError(issue)
      publish(next, false)
      return { ok: true, draft }
    } catch (error) { return failure(error) }
  }
  const rename = (name) => {
    try {
      const previous = current.current
      const entries = readEntries(library)
      const entry = requireCurrent(entries)
      const renamed = { ...entry, name: validName(name, entries, entry.id) }
      const next = entries.map((item) => item.id === entry.id ? renamed : item)
      writeEntries(next)
      publish({ ...previous, entries: next, saved: renamed })
      return { ok: true }
    } catch (error) { return failure(error) }
  }
  const remove = () => {
    try {
      const entries = readEntries(library)
      const entry = requireCurrent(entries)
      const next = entries.filter((item) => item.id !== entry.id)
      writeEntries(next)
      publish({ entries: next, currentId: null, saved: null, draft: newBusinessChainView(), past: [], future: [], issue: '' })
      return { ok: true }
    } catch (error) { return failure(error) }
  }
  return {
    ...state,
    clearIssue: () => publish({ ...current.current, issue: '' }, false),
    change,
    changePresentation,
    undo,
    redo,
    save,
    open,
    rename,
    remove,
    dirty: !equal(state.draft, state.saved?.draft || state.initialDraft || newBusinessChainView()),
  }
}
