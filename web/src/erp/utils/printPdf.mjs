const DEFAULT_PDF_FILE_NAME = 'print-template.pdf'

const renderElementToCanvas = async (element) => {
  const html2canvasModule = await import('html2canvas')
  const html2canvas = html2canvasModule.default || html2canvasModule
  return html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })
}

const buildPdfDocumentFromCanvas = async (canvas) => {
  const jspdfModule = await import('jspdf')
  const { jsPDF: JSPDF } = jspdfModule
  const pdf = new JSPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const sliceHeightPx = Math.max(
    1,
    Math.floor((canvas.width * pageHeight) / pageWidth)
  )
  let offsetY = 0
  let pageIndex = 0

  while (offsetY < canvas.height) {
    const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = currentSliceHeight
    const context = pageCanvas.getContext('2d')
    if (!context) {
      throw new Error('当前浏览器不支持 Canvas 2D 导出。')
    }
    context.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      currentSliceHeight,
      0,
      0,
      canvas.width,
      currentSliceHeight
    )
    const imageData = pageCanvas.toDataURL('image/png')
    const renderedHeight = (currentSliceHeight * pageWidth) / canvas.width
    if (pageIndex > 0) {
      pdf.addPage()
    }
    pdf.addImage(
      imageData,
      'PNG',
      0,
      0,
      pageWidth,
      renderedHeight,
      undefined,
      'FAST'
    )
    offsetY += currentSliceHeight
    pageIndex += 1
  }

  return pdf
}

export const createPdfBlobFromElement = async (element) => {
  if (!element) {
    throw new Error('未找到可导出的打印区域。')
  }
  const canvas = await renderElementToCanvas(element)
  const pdf = await buildPdfDocumentFromCanvas(canvas)
  return pdf.output('blob')
}

export const openPdfPreviewFromElement = async (element) => {
  const blob = await createPdfBlobFromElement(element)
  const previewURL = URL.createObjectURL(blob)
  return { blob, previewURL }
}

export const downloadPdfFromElement = async (
  element,
  fileName = DEFAULT_PDF_FILE_NAME
) => {
  if (!element) {
    throw new Error('未找到可导出的打印区域。')
  }
  const canvas = await renderElementToCanvas(element)
  const pdf = await buildPdfDocumentFromCanvas(canvas)
  pdf.save(fileName || DEFAULT_PDF_FILE_NAME)
}
