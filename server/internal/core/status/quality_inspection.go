package status

const (
	QualityInspectionDraft     = "DRAFT"
	QualityInspectionSubmitted = "SUBMITTED"
	QualityInspectionPassed    = "PASSED"
	QualityInspectionRejected  = "REJECTED"
	QualityInspectionCancelled = "CANCELLED"
)

var qualityInspectionStatuses = map[string]struct{}{
	QualityInspectionDraft:     {},
	QualityInspectionSubmitted: {},
	QualityInspectionPassed:    {},
	QualityInspectionRejected:  {},
	QualityInspectionCancelled: {},
}

type QualityInspectionTransition struct {
	Target  string
	Changed bool
}

func IsQualityInspectionStatus(value string) bool {
	_, ok := qualityInspectionStatuses[NormalizeUpperStatus(value)]
	return ok
}

func SubmitQualityInspection(current string) (QualityInspectionTransition, bool) {
	switch NormalizeUpperStatus(current) {
	case QualityInspectionDraft:
		return QualityInspectionTransition{Target: QualityInspectionSubmitted, Changed: true}, true
	case QualityInspectionSubmitted:
		return QualityInspectionTransition{Target: QualityInspectionSubmitted}, true
	default:
		return QualityInspectionTransition{}, false
	}
}

func DecideQualityInspection(current string, target string) (QualityInspectionTransition, bool) {
	target = NormalizeUpperStatus(target)
	if target != QualityInspectionPassed && target != QualityInspectionRejected {
		return QualityInspectionTransition{}, false
	}
	switch NormalizeUpperStatus(current) {
	case target:
		return QualityInspectionTransition{Target: target}, true
	case QualityInspectionSubmitted:
		return QualityInspectionTransition{Target: target, Changed: true}, true
	default:
		return QualityInspectionTransition{}, false
	}
}

func CancelQualityInspection(current string) (QualityInspectionTransition, bool) {
	switch NormalizeUpperStatus(current) {
	case QualityInspectionDraft, QualityInspectionSubmitted:
		return QualityInspectionTransition{Target: QualityInspectionCancelled, Changed: true}, true
	case QualityInspectionCancelled:
		return QualityInspectionTransition{Target: QualityInspectionCancelled}, true
	default:
		return QualityInspectionTransition{}, false
	}
}
