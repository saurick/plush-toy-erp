import React from 'react'
import {
  scheduleBlurActiveEngineeringEditable,
  clearRequestedEditableFocus,
  EditableText,
} from './EngineeringPrintPrimitives.jsx'
import { PrintAppendixImages } from './PrintAppendixImages.jsx'

const COLOR_CARD_DEFAULT_BODY_ROWS = 3

function getColorCardBodyRowCount(block) {
  const lineCount = Array.isArray(block?.lines) ? block.lines.length : 0
  const minRows = Number(block?.minRows)
  return Math.max(
    1,
    lineCount,
    Number.isFinite(minRows) && minRows > 0
      ? Math.floor(minRows)
      : COLOR_CARD_DEFAULT_BODY_ROWS
  )
}

function splitColorCardBlocks(blocks = []) {
  const sides = {
    left: [],
    right: [],
  }
  const heights = {
    left: 0,
    right: 0,
  }

  blocks.forEach((block, blockIndex) => {
    const side =
      block.side === 'left' || block.side === 'right'
        ? block.side
        : heights.left <= heights.right
          ? 'left'
          : 'right'
    sides[side].push({ block, blockIndex })
    heights[side] += getColorCardBodyRowCount(block) + 1
  })

  return [sides.left, sides.right]
}

function ColorCardPaper({
  draft,
  selectedBlockIndex,
  selectedLine,
  blockSelectionMode,
  lineSelectionMode,
  onSelectBlock,
  onSelectLine,
  onFieldChange,
  onColorBlockChange,
  paperRef,
}) {
  const colorCardSides = splitColorCardBlocks(draft.blocks)

  return (
    <div
      className="erp-engineering-print-paper erp-color-card-paper"
      ref={paperRef}
    >
      <EditableText
        value={draft.companyName}
        rich
        onCommit={(value) => onFieldChange('companyName', value)}
        className="erp-color-card-paper__company"
      />
      <section className="erp-color-card-paper__meta">
        <span>产品编号：</span>
        <EditableText
          value={draft.productNo}
          rich
          onCommit={(value) => onFieldChange('productNo', value)}
        />
        <span>产品名称：</span>
        <EditableText
          value={draft.productName}
          rich
          onCommit={(value) => onFieldChange('productName', value)}
        />
      </section>
      <div className="erp-color-card-paper__sheet">
        {colorCardSides.map((sideBlocks, sideIndex) => (
          <React.Fragment key={`color-card-side-${sideIndex}`}>
            <table
              className="erp-color-card-paper__side"
              aria-label={sideIndex === 0 ? '左侧色卡表' : '右侧色卡表'}
            >
              <colgroup>
                <col className="erp-color-card-paper__material-col" />
                <col className="erp-color-card-paper__position-col" />
                <col className="erp-color-card-paper__method-col" />
              </colgroup>
              <tbody>
                {sideBlocks.map(({ block, blockIndex }) => {
                  const bodyRowCount = getColorCardBodyRowCount(block)
                  const selectedBlock =
                    selectedBlockIndex === blockIndex && !selectedLine
                  const bodyRows = Array.from(
                    { length: bodyRowCount },
                    (_, lineIndex) => block.lines?.[lineIndex] ?? null
                  )
                  const selectBlock = (event) => {
                    if (!blockSelectionMode) return
                    clearRequestedEditableFocus()
                    scheduleBlurActiveEngineeringEditable(
                      event.currentTarget.ownerDocument
                    )
                    event.preventDefault()
                    event.stopPropagation()
                    onSelectBlock(blockIndex)
                  }

                  return (
                    <React.Fragment key={`block-${blockIndex}`}>
                      <tr
                        className={`erp-color-card-paper__block-row erp-color-card-paper__block-head-row${
                          selectedBlock
                            ? ' erp-color-card-paper__block-row--selected'
                            : ''
                        }`}
                        data-color-card-block="true"
                        data-color-card-block-index={blockIndex}
                        onMouseDown={selectBlock}
                      >
                        <td className="erp-color-card-paper__material-name">
                          <EditableText
                            value={block.materialName}
                            rich
                            onCommit={(value) =>
                              onColorBlockChange(
                                blockIndex,
                                'materialName',
                                value
                              )
                            }
                          />
                        </td>
                        <td
                          className="erp-color-card-paper__vendor"
                          colSpan={2}
                        >
                          <EditableText
                            value={block.vendor}
                            rich
                            onCommit={(value) =>
                              onColorBlockChange(blockIndex, 'vendor', value)
                            }
                          />
                        </td>
                      </tr>
                      {bodyRows.map((line, lineIndex) => {
                        const isPersistedLine = Boolean(line)
                        const selected =
                          selectedLine?.blockIndex === blockIndex &&
                          selectedLine?.lineIndex === lineIndex
                        const selectLine = (event) => {
                          if (blockSelectionMode) {
                            selectBlock(event)
                            return
                          }
                          if (!lineSelectionMode) return
                          clearRequestedEditableFocus()
                          scheduleBlurActiveEngineeringEditable(
                            event.currentTarget.ownerDocument
                          )
                          event.preventDefault()
                          event.stopPropagation()
                          onSelectLine(blockIndex, lineIndex, isPersistedLine)
                        }

                        return (
                          <tr
                            className={`erp-color-card-paper__block-row erp-color-card-paper__line-row${
                              selected
                                ? ' erp-engineering-print-row--selected'
                                : ''
                            }${
                              selectedBlock
                                ? ' erp-color-card-paper__block-row--selected'
                                : ''
                            }`}
                            data-color-line={
                              isPersistedLine ? 'true' : undefined
                            }
                            data-color-card-block-index={blockIndex}
                            data-color-line-index={lineIndex}
                            data-color-line-target="true"
                            data-color-line-placeholder={
                              isPersistedLine ? undefined : 'true'
                            }
                            key={`block-${blockIndex}-line-${lineIndex}`}
                            onMouseDown={selectLine}
                          >
                            {lineIndex === 0 ? (
                              <td
                                className="erp-color-card-paper__swatch-cell"
                                rowSpan={bodyRowCount}
                                onMouseDown={selectBlock}
                              />
                            ) : null}
                            <td className="erp-color-card-paper__position-cell">
                              <EditableText
                                value={line?.position ?? ''}
                                rich
                                onCommit={(value) =>
                                  onColorBlockChange(
                                    blockIndex,
                                    `lines.${lineIndex}.position`,
                                    value
                                  )
                                }
                              />
                            </td>
                            <td className="erp-color-card-paper__method-cell">
                              <EditableText
                                value={line?.method ?? ''}
                                rich
                                onCommit={(value) =>
                                  onColorBlockChange(
                                    blockIndex,
                                    `lines.${lineIndex}.method`,
                                    value
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {sideIndex === 0 ? (
              <div
                className="erp-color-card-paper__gutter"
                aria-hidden="true"
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>
      <footer className="erp-color-card-paper__footer">
        {[
          ['制卡：', 'maker'],
          ['日期：', 'dateText'],
          ['审核：', 'auditor'],
          ['复核：', 'reviewer'],
        ].map(([label, key]) => (
          <span key={key}>
            {label}
            <EditableText
              value={draft[key]}
              rich
              onCommit={(value) => onFieldChange(key, value)}
            />
          </span>
        ))}
      </footer>
      <PrintAppendixImages images={draft.appendixImages} />
    </div>
  )
}

export { ColorCardPaper }
