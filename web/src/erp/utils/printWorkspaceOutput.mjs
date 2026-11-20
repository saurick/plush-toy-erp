function waitForPrintWorkspaceFrame(windowLike) {
  return new Promise((resolve) => {
    if (typeof windowLike?.requestAnimationFrame === 'function') {
      windowLike.requestAnimationFrame(() => resolve())
      return
    }
    if (typeof windowLike?.setTimeout === 'function') {
      windowLike.setTimeout(resolve, 0)
      return
    }
    resolve()
  })
}

export async function preparePrintWorkspaceSnapshot({
  windowLike,
  beforeSnapshot,
} = {}) {
  if (typeof beforeSnapshot === 'function') {
    await beforeSnapshot()
  }
  await waitForPrintWorkspaceFrame(windowLike)
  await waitForPrintWorkspaceFrame(windowLike)
  if (windowLike?.document?.fonts?.ready) {
    let timeout
    try {
      await Promise.race([
        windowLike.document.fonts.ready,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('打印字体加载超时，请重试。')),
            8000
          )
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  }
}
