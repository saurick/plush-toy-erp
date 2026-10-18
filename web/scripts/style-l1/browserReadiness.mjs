// Measure geometry after portals have mounted and finite CSS motion has settled.
// Loading spinners must not block browser assertions.
export async function waitForFiniteAnimations(page, { selector = '' } = {}) {
  await page.evaluate(async (targetSelector) => {
    const frames = () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
    let timer
    let stopped = false
    const runningMotion = () => {
      const roots = targetSelector
        ? [...document.querySelectorAll(targetSelector)].filter((element) => element.getClientRects().length > 0)
        : [document]
      return roots.flatMap((root) => root.getAnimations({ subtree: true }))
        .filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity)
    }
    const settle = async () => {
      await frames()
      // Viewport changes can replace CSS transitions while their old finished promise stays pending.
      // Read current motion again so replacements still wait and completed transitions cannot hang.
      while (!stopped) {
        if (runningMotion().length === 0) {
          await frames()
          if (runningMotion().length === 0) return
        } else {
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
      }
    }
    try {
      await Promise.race([settle(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Browser motion did not settle: ${targetSelector || 'document'}`)), 5000)
      })])
    } finally {
      stopped = true
      clearTimeout(timer)
    }
  }, selector)
}
