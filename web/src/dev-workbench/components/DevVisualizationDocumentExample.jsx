import React, { useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import DocumentGuide, { DocumentGuideAnnotations } from '@/erp/components/DocumentGuide.jsx'
import { measureDocumentGuideRegion } from '@/erp/components/documentGuideGeometry.mjs'
import { WorkbenchSection } from './WorkbenchPattern.jsx'

const PARTS = [
  { title: '合同抬头', description: '核对合同号与双方抬头。', selector: '[data-guide-zone="identity"]' },
  { title: '采购明细', description: '逐行核对物料、规格、数量与单位。', selector: '[data-guide-zone="items"]' },
  { title: '条款与签字', description: '核对验收约定及双方签署位置。', selector: '[data-guide-zone="terms"]' },
]

function ExamplePaper({ paperRef }) {
  return (
    <div className="erp-dev-visualization__paper" ref={paperRef} aria-label="采购合同演示纸面">
      <strong className="erp-dev-visualization__paper-title">采购合同</strong>
      <div data-guide-zone="identity">
        <div>合同号：PO-DEMO-001</div>
        <div>采购方：示例工厂；供货方：示例材料商</div>
      </div>
      <table data-table-lines="fixed" data-guide-zone="items" aria-label="采购明细演示表">
        <thead><tr><th scope="col">物料</th><th scope="col">规格</th><th scope="col">数量</th></tr></thead>
        <tbody><tr><td>绒布</td><td>米白</td><td>60 米</td></tr></tbody>
      </table>
      <div data-guide-zone="terms">
        <div>验收：到货后核对物料规格与数量。</div>
        <div>采购方签字：______；供货方签字：______</div>
      </div>
    </div>
  )
}

function AnnotatedPaper({ activeIndex, onSelect }) {
  const paperRef = useRef(null)
  const [regions, setRegions] = useState([])
  useLayoutEffect(() => {
    const paper = paperRef.current
    const targets = PARTS.map(({ selector }) => Array.from(paper.querySelectorAll(selector)))
    const measure = () => {
      const bounds = paper.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      setRegions(targets.map((nodes) => measureDocumentGuideRegion(
        bounds, nodes.map((node) => node.getBoundingClientRect())
      )))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paper)
    targets.flat().forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="erp-document-guide__frame">
      <div className="erp-dev-visualization__paper-shell">
        <ExamplePaper paperRef={paperRef} />
        <DocumentGuideAnnotations parts={PARTS} regions={regions} activeIndex={activeIndex} onSelect={onSelect} />
      </div>
    </div>
  )
}

export default function DevVisualizationDocumentExample() {
  const [plain, setPlain] = useState(false)
  return (
    <WorkbenchSection
      title="采购合同：哪一块填什么？"
      headingLevel={4}
      description="区域标注 · 演示模板"
      actions={<Button size="small" onClick={() => setPlain((value) => !value)}>{plain ? '返回标注说明' : '看打印效果'}</Button>}
    >
      <div hidden={plain}>
        <DocumentGuide parts={PARTS}>
          {({ activeIndex, onSelect }) => <AnnotatedPaper activeIndex={activeIndex} onSelect={onSelect} />}
        </DocumentGuide>
      </div>
      {plain ? <div className="erp-dev-visualization__paper-print"><ExamplePaper /></div> : null}
    </WorkbenchSection>
  )
}
