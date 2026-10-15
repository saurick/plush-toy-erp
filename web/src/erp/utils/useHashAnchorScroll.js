import { useEffect } from 'react'

const readCurrentHashId = () => {
  if (typeof window === 'undefined') return ''
  return decodeURIComponent(window.location.hash || '')
    .replace(/^#/, '')
    .trim()
}

const scrollHashTargetIntoView = (hashId) => {
  if (!hashId || typeof document === 'undefined') return false

  const target = document.getElementById(hashId)
  if (!(target instanceof HTMLElement)) return false
  if (typeof target.scrollIntoView !== 'function') return false

  target.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return true
}

export const useHashAnchorScroll = (readyKey = 'ready') => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let timerId = 0
    let frameId = 0

    const runScroll = () => {
      const hashId = readCurrentHashId()
      if (!hashId) return

      let attempts = 0
      const tryScroll = () => {
        attempts += 1
        if (scrollHashTargetIntoView(hashId) || attempts >= 6) return
        timerId = window.setTimeout(tryScroll, 80)
      }

      frameId = window.requestAnimationFrame(tryScroll)
    }

    const handleHashChange = () => {
      window.clearTimeout(timerId)
      window.cancelAnimationFrame(frameId)
      runScroll()
    }

    runScroll()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.clearTimeout(timerId)
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [readyKey])
}
