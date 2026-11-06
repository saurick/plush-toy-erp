import { getBusinessHelpItem } from '../../config/businessUsabilityCatalog.mjs'

const concession = getBusinessHelpItem('quality-inspections', 'concession-acceptance')

export const QUALITY_CONCESSION_HELP = `${concession.explanation} ${concession.effect}`

export const QUALITY_RESULT_OPTIONS = [
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION', help: QUALITY_CONCESSION_HELP },
  { label: '不合格', value: 'REJECT' },
]
