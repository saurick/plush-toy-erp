// Keep row shortcuts compatible with controls and text selection. The marked
// entry remains the keyboard and focus target when the drawer closes.
export function openWorkflowTaskRow(event, onOpen) {
  if (event.target.closest('button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [role="combobox"]')) return
  const selection = event.currentTarget.ownerDocument.getSelection()
  if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return
  event.currentTarget.querySelector('[data-task-entry]')?.focus({ preventScroll: true })
  onOpen()
}
