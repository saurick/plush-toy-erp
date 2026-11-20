import React, { memo, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons'
import MaterialPurchaseContractPaper from './MaterialPurchaseContractPaper.jsx'
import ProcessingContractPaper from './ProcessingContractPaper.jsx'
import { MaterialDetailPaper } from './MaterialDetailPaper.jsx'
import { ColorCardPaper } from './ColorCardPaper.jsx'
import { WorkInstructionPaper } from './WorkInstructionPaper.jsx'
import { computeMaterialPurchaseTotals } from '../../utils/materialPurchaseContractEditor.mjs'
import DocumentGuide, { DocumentGuideAnnotations } from '../DocumentGuide.jsx'
import { measureDocumentGuideRegion } from '../documentGuideGeometry.mjs'

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

const TemplatePaperPreview = memo(TemplatePaper)

export default function PrintTemplateGuide({ template }) {
  const viewportRef = useRef(null)
  const paperRef = useRef(null)
  const [layout, setLayout] = useState(null)
  const [zoom, setZoom] = useState(null)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const paper = paperRef.current
    const updateLayout = () => {
      const width = paper.offsetWidth
      const height = paper.offsetHeight
      const style = getComputedStyle(viewport.firstElementChild)
      const availableWidth =
        viewport.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      const availableHeight =
        viewport.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom)
      if (!width || !height || availableWidth <= 0 || availableHeight <= 0) {
        return
      }
      const scale =
        zoom ?? Math.min(availableWidth / width, availableHeight / height, 1)
      const paperRect = paper.getBoundingClientRect()
      const regions = template.guide.map(({ selector, separateTargets }) =>
        measureDocumentGuideRegion(
          paperRect,
          [...paper.querySelectorAll(selector)].map((target) =>
            target.getBoundingClientRect()
          ),
          separateTargets
        )
      )
      setLayout({
        width: width * scale,
        height: height * scale,
        scale,
        regions,
      })
    }
    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(viewport)
    observer.observe(paper)
    template.guide.forEach(({ selector }) => {
      paper
        .querySelectorAll(selector)
        .forEach((target) => observer.observe(target))
    })
    return () => observer.disconnect()
  }, [template, zoom])

  useLayoutEffect(() => {
    viewportRef.current.scrollTo(0, 0)
  }, [template, zoom])

  const changeZoom = (direction) => {
    const current = layout?.scale ?? 1
    const step =
      direction > 0
        ? Math.floor(current * 4 + 0.001) + 1
        : Math.ceil(current * 4 - 0.001) - 1
    setZoom(Math.min(1.5, Math.max(0.25, step / 4)))
  }

  return (
    <section
      className="erp-template-guide"
      aria-label={`${template.title}模板说明`}
    >
      <div className="erp-template-guide__toolbar">
        <div className="erp-template-guide__heading">
          <h3 className="erp-template-guide__title">{template.title}</h3>
          <span>版式示意</span>
        </div>
        <div
          className="erp-template-guide__zoom-controls"
          role="group"
          aria-label="纸面缩放"
        >
          <Button
            icon={<MinusOutlined aria-hidden="true" />}
            aria-label="缩小纸面"
            disabled={!layout || layout.scale <= 0.25}
            onClick={() => changeZoom(-1)}
          />
          <output aria-label="纸面缩放比例">
            {Math.round((layout?.scale ?? 1) * 100)}%
          </output>
          <Button
            icon={<PlusOutlined aria-hidden="true" />}
            aria-label="放大纸面"
            disabled={!layout || layout.scale >= 1.5}
            onClick={() => changeZoom(1)}
          />
          <Button aria-pressed={zoom === null} onClick={() => setZoom(null)}>
            适合整页
          </Button>
        </div>
      </div>
      <DocumentGuide fill parts={template.guide} summary={template.summary}>
        {({ activeIndex, onSelect }) => (
          <div className="erp-template-guide__viewport" ref={viewportRef}>
            <div className="erp-document-guide__frame">
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
                  <TemplatePaperPreview template={template} />
                </div>
                {layout && (
                  <DocumentGuideAnnotations
                    parts={template.guide}
                    regions={layout.regions}
                    activeIndex={activeIndex}
                    onSelect={onSelect}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </DocumentGuide>
    </section>
  )
}
