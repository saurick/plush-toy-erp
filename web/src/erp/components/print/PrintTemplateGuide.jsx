import React, { useLayoutEffect, useRef, useState } from 'react'
import MaterialPurchaseContractPaper from './MaterialPurchaseContractPaper.jsx'
import ProcessingContractPaper from './ProcessingContractPaper.jsx'
import { MaterialDetailPaper } from './MaterialDetailPaper.jsx'
import { ColorCardPaper } from './ColorCardPaper.jsx'
import { WorkInstructionPaper } from './WorkInstructionPaper.jsx'
import { computeMaterialPurchaseTotals } from '../../utils/materialPurchaseContractEditor.mjs'

const engineeringPapers = {
  'engineering-material-detail': MaterialDetailPaper,
  'engineering-color-card': ColorCardPaper,
  'engineering-work-instruction': WorkInstructionPaper,
}
const ignorePreviewChange = () => {}

function TemplatePaper({ template }) {
  if (template.key === 'material-purchase-contract') {
    return (
      <MaterialPurchaseContractPaper
        draft={template.sample}
        templateModesActive
        totals={computeMaterialPurchaseTotals(template.sample.lines, {
          merges: template.sample.merges,
        })}
      />
    )
  }
  if (template.key === 'processing-contract') {
    return (
      <ProcessingContractPaper contract={template.sample} lineSelectionMode />
    )
  }
  const Paper = engineeringPapers[template.key]
  return (
    <Paper
      draft={template.sample}
      onFieldChange={ignorePreviewChange}
      onInstructionRowImageInputRef={ignorePreviewChange}
    />
  )
}

export default function PrintTemplateGuide({ template }) {
  const viewportRef = useRef(null)
  const paperRef = useRef(null)
  const [layout, setLayout] = useState(null)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const paper = paperRef.current
    const updateLayout = () => {
      const width = paper.offsetWidth
      const height = paper.offsetHeight
      if (!width || !height || viewport.clientWidth <= 36) return
      const scale = Math.min(
        (viewport.clientWidth - 36) / width,
        480 / height,
        1
      )
      const paperRect = paper.getBoundingClientRect()
      const markers = template.guide.map(({ selector }) => {
        const target = paper.querySelector(selector)
        if (!target) return null
        const rect = target.getBoundingClientRect()
        return (
          ((rect.top + rect.height / 2 - paperRect.top) / paperRect.height) *
          100
        )
      })
      setLayout({
        width: width * scale,
        height: height * scale,
        scale,
        markers,
      })
    }
    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(viewport)
    observer.observe(paper)
    template.guide.forEach(({ selector }) => {
      const target = paper.querySelector(selector)
      if (target) observer.observe(target)
    })
    return () => observer.disconnect()
  }, [template])

  return (
    <section
      className="erp-template-guide"
      aria-label={`${template.title}模板说明`}
    >
      <h3 className="erp-template-guide__title">{template.title}</h3>
      <p className="erp-template-guide__purpose">{template.summary}</p>
      <div className="erp-template-guide__body">
        <figure className="erp-template-guide__figure" ref={viewportRef}>
          <div
            className="erp-template-guide__thumbnail"
            style={
              layout
                ? { width: layout.width, height: layout.height }
                : undefined
            }
          >
            {/* 复用正式纸面；inert 同时禁止鼠标、键盘和上传入口进入预览。 */}
            <div
              ref={paperRef}
              className="erp-template-guide__paper"
              inert=""
              aria-hidden="true"
              style={{
                transform: `scale(${layout?.scale ?? 1})`,
                visibility: layout ? 'visible' : 'hidden',
              }}
            >
              <TemplatePaper template={template} />
            </div>
            {template.guide.map((part, index) =>
              layout?.markers[index] != null ? (
                <span
                  className="erp-template-guide__marker"
                  key={part.title}
                  style={{ top: `${layout.markers[index]}%` }}
                  aria-hidden="true"
                  data-guide-target={part.selector}
                >
                  {index + 1}
                </span>
              ) : null
            )}
          </div>
          <figcaption>版式示意</figcaption>
        </figure>
        <ol className="erp-template-guide__parts">
          {template.guide.map((part, index) => (
            <li key={part.title}>
              <span className="erp-template-guide__number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h4>{part.title}</h4>
                <p>{part.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
