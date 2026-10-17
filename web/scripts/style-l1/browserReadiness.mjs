// Measure geometry after portals have mounted and finite CSS motion has settled.
// Loading spinners must not block browser assertions.
export async function waitForFiniteAnimations(page, { selector = '' } = {}) {
  await page.evaluate(async (targetSelector) => {
    const frames = () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
    let timer
    const settle = async () => {
      await frames()
      const roots = targetSelector
        ? [...document.querySelectorAll(targetSelector)].filter((element) => element.getClientRects().length > 0)
        : [document]
      await Promise.all(roots.flatMap((root) => root.getAnimations())
        .filter(
          (animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished.catch(() => {}))
      )
      await frames()
    }
    try {
      await Promise.race([settle(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Browser motion did not settle: ${targetSelector || 'document'}`)), 5000)
      })])
    } finally {
      clearTimeout(timer)
    }
  }, selector)
}
