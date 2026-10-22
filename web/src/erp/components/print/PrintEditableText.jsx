import React, { useLayoutEffect, useRef } from 'react'
import { usePrintEditableDraftSync } from './usePrintEditableDraftSync.js'
import { runSilentPrintWorkspaceDraftUpdate } from '../../utils/usePersistentPrintWorkspaceDraft.js'

export default function PrintEditableText({
  as: Component = 'span',
  editableRef: providedRef,
  value,
  text = String(value ?? '').trim() ? String(value ?? '') : '\u00A0',
  html,
  commitElementValue,
  disabled = false,
  onInput,
  ...props
}) {
  const internalRef = useRef(null)
  const editableRef = providedRef || internalRef

  // 外部值只在此处同步，避免 React 协调正文时绕过焦点保护。
  useLayoutEffect(() => {
    const element = editableRef.current
    if (!element || element.ownerDocument?.activeElement === element) return
    if (html !== undefined) {
      if (element.innerHTML !== html) element.innerHTML = html
    } else if (element.textContent !== text) {
      element.textContent = text
    }
  }, [editableRef, Component, html, text])

  usePrintEditableDraftSync({
    editableRef,
    commitElementValue,
    elementType: Component,
    disabled,
  })

  return (
    <Component
      {...props}
      ref={editableRef}
      data-print-empty={
        !String(value ?? '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, '')
          .trim()
      }
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(event) => {
        onInput?.(event)
        runSilentPrintWorkspaceDraftUpdate(() => {
          commitElementValue(event.currentTarget)
        })
      }}
      onBlur={(event) => {
        commitElementValue(event.currentTarget, { normalizeElement: true })
      }}
    />
  )
}
