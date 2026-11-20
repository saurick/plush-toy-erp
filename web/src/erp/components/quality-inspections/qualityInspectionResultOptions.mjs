import { getBusinessHelpItem } from '../../config/businessUsabilityCatalog.mjs'
import { QUALITY_RESULT_LABELS } from '../../utils/qualityInspectionLabels.mjs'

const concession = getBusinessHelpItem('quality-inspections', 'concession-acceptance')

export const QUALITY_CONCESSION_HELP = `${concession.explanation} ${concession.effect}`

export const QUALITY_RESULT_OPTIONS = Object.entries(QUALITY_RESULT_LABELS).map(([value, label]) => (
  value === 'CONCESSION' ? { value, label, help: QUALITY_CONCESSION_HELP } : { value, label }
))
