export async function withDeadline(promise, label, timeoutMs = 10_000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
