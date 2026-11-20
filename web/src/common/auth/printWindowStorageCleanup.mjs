const RETIRED_STATE_PREFIX = '__plush_erp_print_window_state__:'
const RETIRED_DATABASE_NAME = '__plush_erp_print_window_state_db__'

// This store contained unscoped HTML snapshots. Scoped structured drafts have
// their own store and remain available to their original account.
export function clearRetiredPrintWindowState(windowLike = globalThis.window) {
  try {
    const storage = windowLike?.localStorage
    for (let index = (storage?.length || 0) - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith(RETIRED_STATE_PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Storage access may be denied; retired snapshots have no restore path.
  }
  try {
    const request = windowLike?.indexedDB?.deleteDatabase(RETIRED_DATABASE_NAME)
    if (request) request.onerror = () => {}
  } catch {
    // Best effort cleanup must not prevent login or logout.
  }
}
