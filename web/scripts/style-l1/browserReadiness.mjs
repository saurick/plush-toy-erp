// Measure geometry after portals have mounted and finite CSS motion has settled.
// Loading spinners must not block browser assertions.
export async function waitForFiniteAnimations(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished.catch(() => {}))
    )
  })
}
