package status

const (
	PurchaseReceiptDraft     = "DRAFT"
	PurchaseReceiptPosted    = "POSTED"
	PurchaseReceiptCancelled = "CANCELLED"

	PurchaseReturnDraft     = "DRAFT"
	PurchaseReturnPosted    = "POSTED"
	PurchaseReturnCancelled = "CANCELLED"

	PurchaseReceiptAdjustmentDraft     = "DRAFT"
	PurchaseReceiptAdjustmentPosted    = "POSTED"
	PurchaseReceiptAdjustmentCancelled = "CANCELLED"
)

var postingDocumentStatuses = map[string]struct{}{
	"DRAFT":     {},
	"POSTED":    {},
	"CANCELLED": {},
}

type PostingDocumentTransition struct {
	Target  string
	Changed bool
}

func IsPostingDocumentStatus(value string) bool {
	_, ok := postingDocumentStatuses[NormalizeUpperStatus(value)]
	return ok
}

func IsPurchaseReceiptStatus(value string) bool {
	return IsPostingDocumentStatus(value)
}

func IsPurchaseReturnStatus(value string) bool {
	return IsPostingDocumentStatus(value)
}

func IsPurchaseReceiptAdjustmentStatus(value string) bool {
	return IsPostingDocumentStatus(value)
}

func IsPurchaseReceiptPosted(value string) bool {
	return NormalizeUpperStatus(value) == PurchaseReceiptPosted
}

func CanAddPurchaseReceiptItem(current string) bool {
	return NormalizeUpperStatus(current) == PurchaseReceiptDraft
}

func CanAddPurchaseReturnItem(current string) bool {
	return NormalizeUpperStatus(current) == PurchaseReturnDraft
}

func CanAddPurchaseReceiptAdjustmentItem(current string) bool {
	return NormalizeUpperStatus(current) == PurchaseReceiptAdjustmentDraft
}

func PostPurchaseReceipt(current string) (PostingDocumentTransition, bool) {
	return postDraftDocument(current, PurchaseReceiptPosted)
}

func CancelPurchaseReceipt(current string) (PostingDocumentTransition, bool) {
	return cancelPostingDocument(current, PurchaseReceiptCancelled)
}

func PostPurchaseReturn(current string) (PostingDocumentTransition, bool) {
	return postDraftDocument(current, PurchaseReturnPosted)
}

func CancelPurchaseReturn(current string) (PostingDocumentTransition, bool) {
	return cancelPostingDocument(current, PurchaseReturnCancelled)
}

func PostPurchaseReceiptAdjustment(current string) (PostingDocumentTransition, bool) {
	return postDraftDocument(current, PurchaseReceiptAdjustmentPosted)
}

func CancelPurchaseReceiptAdjustment(current string) (PostingDocumentTransition, bool) {
	return cancelPostingDocument(current, PurchaseReceiptAdjustmentCancelled)
}

func postDraftDocument(current string, postedStatus string) (PostingDocumentTransition, bool) {
	switch NormalizeUpperStatus(current) {
	case "DRAFT":
		return PostingDocumentTransition{Target: postedStatus, Changed: true}, true
	case "POSTED":
		return PostingDocumentTransition{Target: postedStatus}, true
	default:
		return PostingDocumentTransition{}, false
	}
}

func cancelPostingDocument(current string, cancelledStatus string) (PostingDocumentTransition, bool) {
	switch NormalizeUpperStatus(current) {
	case "DRAFT", "POSTED":
		return PostingDocumentTransition{Target: cancelledStatus, Changed: true}, true
	case "CANCELLED":
		return PostingDocumentTransition{Target: cancelledStatus}, true
	default:
		return PostingDocumentTransition{}, false
	}
}
