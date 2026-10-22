package biz

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"server/internal/core/qualitycheck"
)

type qualityInspectionBehaviorRepo struct {
	QualityInspectionRepo
	created    []QualityInspectionCreate
	sources    []QualityInspectionFromPurchaseReceiptCreate
	decisions  []QualityInspectionDecision
	submitted  []int
	filters    []QualityInspectionFilter
	cancelled  []int
	cancelNote *string
	err        error
}

func (r *qualityInspectionBehaviorRepo) CreateQualityInspectionDraft(_ context.Context, in *QualityInspectionCreate) (*QualityInspection, error) {
	r.created = append(r.created, *in)
	return &QualityInspection{ID: 20, Status: QualityInspectionStatusDraft}, r.err
}

func (r *qualityInspectionBehaviorRepo) CreateFinishedGoodsQualityInspectionDraft(_ context.Context, in *QualityInspectionCreate) (*QualityInspection, error) {
	r.created = append(r.created, *in)
	return &QualityInspection{ID: 21, Status: QualityInspectionStatusDraft}, r.err
}

func (r *qualityInspectionBehaviorRepo) CreateQualityInspectionFromPurchaseReceipt(_ context.Context, in *QualityInspectionFromPurchaseReceiptCreate) (*QualityInspection, error) {
	r.sources = append(r.sources, *in)
	return &QualityInspection{ID: 22, Status: QualityInspectionStatusDraft}, r.err
}

func (r *qualityInspectionBehaviorRepo) CreateQualityInspectionFromOutsourcingReturn(context.Context, *QualityInspectionFromOutsourcingReturnCreate) (*QualityInspection, error) {
	panic("purchase receipt quality must not use outsourcing source")
}

func (r *qualityInspectionBehaviorRepo) SubmitQualityInspection(_ context.Context, id int) (*QualityInspection, error) {
	r.submitted = append(r.submitted, id)
	return nil, r.err
}

func (r *qualityInspectionBehaviorRepo) PassQualityInspection(_ context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	r.decisions = append(r.decisions, *in)
	return &QualityInspection{ID: in.InspectionID, Status: QualityInspectionStatusPassed}, r.err
}

func (r *qualityInspectionBehaviorRepo) RejectQualityInspection(_ context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	r.decisions = append(r.decisions, *in)
	return &QualityInspection{ID: in.InspectionID, Status: QualityInspectionStatusRejected}, r.err
}

func (r *qualityInspectionBehaviorRepo) ListQualityInspections(_ context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error) {
	r.filters = append(r.filters, filter)
	return []*QualityInspection{{ID: 20}}, 7, r.err
}

func (r *qualityInspectionBehaviorRepo) CancelQualityInspection(_ context.Context, id int, note *string) (*QualityInspection, error) {
	r.cancelled, r.cancelNote = append(r.cancelled, id), note
	return &QualityInspection{ID: id, Status: QualityInspectionStatusCancelled}, r.err
}

func TestQualityInspectionUsecasePurchaseSourceRejectsIncompleteIdentity(t *testing.T) {
	if _, broad := any(&qualityInspectionBehaviorRepo{}).(InventoryRepo); broad {
		t.Fatal("quality behavior fixture must not require inventory, BOM or receipt writes")
	}
	for _, tc := range []struct {
		name string
		in   QualityInspectionFromPurchaseReceiptCreate
	}{
		{"missing number", QualityInspectionFromPurchaseReceiptCreate{PurchaseReceiptID: 7, PurchaseReceiptItemID: 8}},
		{"missing receipt", QualityInspectionFromPurchaseReceiptCreate{InspectionNo: "IQC-7", PurchaseReceiptItemID: 8}},
		{"missing line", QualityInspectionFromPurchaseReceiptCreate{InspectionNo: "IQC-7", PurchaseReceiptID: 7}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &qualityInspectionBehaviorRepo{}
			_, err := NewQualityInspectionUsecase(repo).CreateQualityInspectionFromPurchaseReceipt(context.Background(), &tc.in)
			if !errors.Is(err, ErrBadParam) || len(repo.sources)+len(repo.created) != 0 {
				t.Fatalf("invalid source reached storage: %v", err)
			}
		})
	}
	note := "  到货检验  "
	in := QualityInspectionFromPurchaseReceiptCreate{InspectionNo: " IQC-7 ", PurchaseReceiptID: 7, PurchaseReceiptItemID: 8, DecisionNote: &note}
	repo := &qualityInspectionBehaviorRepo{err: ErrQualityInspectionSourceConflict}
	if _, err := NewQualityInspectionUsecase(repo).CreateQualityInspectionFromPurchaseReceipt(context.Background(), &in); !errors.Is(err, ErrQualityInspectionSourceConflict) || len(repo.sources) != 1 || len(repo.created) != 0 {
		t.Fatalf("source creation must remain atomic and preserve conflict: %v", err)
	}
	got := repo.sources[0]
	if got.InspectionNo != "IQC-7" || got.PurchaseReceiptID != 7 || got.PurchaseReceiptItemID != 8 || got.DecisionNote == nil || *got.DecisionNote != "到货检验" || note != "  到货检验  " {
		t.Fatalf("source intent or caller note was changed: %#v", got)
	}
	if _, err := NewQualityInspectionUsecase(&inventoryBehaviorRepo{}).CreateQualityInspectionFromPurchaseReceipt(context.Background(), &in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing source adapter must not fall back to technical draft creation: %v", err)
	}
}

func TestQualityInspectionUsecaseIncomingDraftRejectsMixedSourceFacts(t *testing.T) {
	base := QualityInspectionCreate{InspectionNo: "IQC-7", PurchaseReceiptID: 7, InventoryLotID: 8, MaterialID: 9, WarehouseID: 3}
	for _, tc := range []struct {
		name string
		edit func(*QualityInspectionCreate)
	}{
		{"other source type", func(in *QualityInspectionCreate) { in.SourceType = QualityInspectionSourceShipment }},
		{"other source id", func(in *QualityInspectionCreate) { in.SourceID = 10 }},
		{"other inspection type", func(in *QualityInspectionCreate) { in.InspectionType = QualityInspectionTypeFinishedGoods }},
		{"product subject", func(in *QualityInspectionCreate) { in.SubjectType = QualityInspectionSubjectProduct }},
		{"other material", func(in *QualityInspectionCreate) { in.SubjectID = 10 }},
		{"missing lot", func(in *QualityInspectionCreate) { in.InventoryLotID = 0 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &qualityInspectionBehaviorRepo{}
			in := base
			tc.edit(&in)
			if _, err := NewQualityInspectionUsecase(repo).CreateQualityInspectionDraft(context.Background(), &in); !errors.Is(err, ErrBadParam) || len(repo.created) != 0 {
				t.Fatalf("inconsistent source reached storage: %v", err)
			}
		})
	}
	repo := &qualityInspectionBehaviorRepo{}
	if _, err := NewQualityInspectionUsecase(repo).CreateQualityInspectionDraft(context.Background(), &base); err != nil || len(repo.created) != 1 {
		t.Fatalf("valid draft rejected: %v", err)
	}
	got := repo.created[0]
	if got.SourceID != 7 || got.SubjectID != 9 || got.SourceType != QualityInspectionSourcePurchaseReceipt || got.SubjectType != QualityInspectionSubjectMaterial || got.InspectionType != QualityInspectionTypeIncoming {
		t.Fatalf("incoming source defaults lost: %#v", got)
	}
}

func TestQualityInspectionUsecaseFinishedGoodsClearsIncomingOnlyFields(t *testing.T) {
	line := 11
	in := QualityInspectionCreate{InspectionNo: "FQC-7", SourceID: 7, SubjectID: 9, WarehouseID: 3, InventoryLotID: 8, PurchaseReceiptID: 5, PurchaseReceiptItemID: &line, MaterialID: 6}
	before := in
	repo := &qualityInspectionBehaviorRepo{}
	if _, err := NewQualityInspectionUsecase(repo).CreateFinishedGoodsQualityInspectionDraft(context.Background(), &in); err != nil || len(repo.created) != 1 {
		t.Fatalf("finished goods draft rejected: %v", err)
	}
	got := repo.created[0]
	if got.PurchaseReceiptID != 0 || got.PurchaseReceiptItemID != nil || got.MaterialID != 0 || got.SourceType != QualityInspectionSourceShipment || got.SubjectType != QualityInspectionSubjectProduct || !reflect.DeepEqual(in, before) {
		t.Fatalf("incoming residue leaked into finished goods or changed caller input: %#v", got)
	}
}

func qualityInspectionBehaviorDecision() QualityInspectionDecision {
	return QualityInspectionDecision{
		InspectionID: 20,
		InspectedAt:  time.Date(2026, 10, 1, 12, 0, 0, 123456789, time.FixedZone("source", 8*3600)),
		CheckItems:   []qualitycheck.Item{{Name: "外观", Requirement: "与确认样一致", Observation: "按确认样核对", Result: "PASS", Scope: "FULL"}},
	}
}

func TestQualityInspectionUsecaseDecisionsRejectContradictoryEvidence(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*QualityInspectionDecision)
	}{
		{"pass endpoint cannot reject", func(in *QualityInspectionDecision) { in.Result = QualityInspectionResultReject }},
		{"failed check cannot pass", func(in *QualityInspectionDecision) { in.CheckItems[0].Result = "FAIL" }},
		{"unchecked evidence", func(in *QualityInspectionDecision) { in.CheckItems[0].Result = "NOT_CHECKED" }},
		{"sample without coverage note", func(in *QualityInspectionDecision) { in.CheckItems[0].Scope = "SAMPLE" }},
		{"concession without reason", func(in *QualityInspectionDecision) {
			in.Result = QualityInspectionResultConcession
			in.CheckItems[0].Result = "FAIL"
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &qualityInspectionBehaviorRepo{}
			in := qualityInspectionBehaviorDecision()
			tc.edit(&in)
			if _, err := NewQualityInspectionUsecase(repo).PassQualityInspection(context.Background(), &in); !errors.Is(err, ErrBadParam) || len(repo.decisions) != 0 {
				t.Fatalf("contradictory evidence reached decision storage: %v", err)
			}
		})
	}
	repo := &qualityInspectionBehaviorRepo{}
	in := qualityInspectionBehaviorDecision()
	in.Result = QualityInspectionResultPass
	if _, err := NewQualityInspectionUsecase(repo).RejectQualityInspection(context.Background(), &in); !errors.Is(err, ErrBadParam) || len(repo.decisions) != 0 {
		t.Fatalf("reject endpoint accepted a passing result: %v", err)
	}
}

func TestQualityInspectionUsecaseDecisionPreservesFailureRetryAndEvidenceTime(t *testing.T) {
	storageErr := errors.New("quality decision storage unavailable")
	repo := &qualityInspectionBehaviorRepo{err: storageErr}
	uc := NewQualityInspectionUsecase(repo)
	in := qualityInspectionBehaviorDecision()
	if _, err := uc.PassQualityInspection(context.Background(), &in); !errors.Is(err, storageErr) {
		t.Fatalf("decision error was lost: %v", err)
	}
	repo.err = nil
	got, err := uc.PassQualityInspection(context.Background(), &in)
	if err != nil || got.Status != QualityInspectionStatusPassed || len(repo.decisions) != 2 || !reflect.DeepEqual(repo.decisions[0], repo.decisions[1]) {
		t.Fatalf("same evidence retry changed intent: result=%v err=%v", got, err)
	}
	wantTime := time.Date(2026, 10, 1, 4, 0, 0, 123456000, time.UTC)
	if !repo.decisions[0].InspectedAt.Equal(wantTime) || repo.decisions[0].InspectedAtDefaulted || in.InspectedAt.Nanosecond() != 123456789 {
		t.Fatal("explicit evidence time must be preserved at storage precision without changing caller input")
	}
	in.Result = QualityInspectionResultReject
	in.CheckItems[0].Result = "FAIL"
	if got, err := uc.RejectQualityInspection(context.Background(), &in); err != nil || got.Status != QualityInspectionStatusRejected {
		t.Fatalf("valid rejection failed: result=%v err=%v", got, err)
	}
	// The embedded inventory methods panic if a quality decision attempts to write stock.
}

func TestQualityInspectionUsecaseListsKeepInspectionKindsSeparate(t *testing.T) {
	for _, tc := range []struct {
		name, source, kind, subject string
		call                        func(*QualityInspectionUsecase, context.Context, QualityInspectionFilter) ([]*QualityInspection, int, error)
		mixed                       QualityInspectionFilter
	}{
		{"incoming", QualityInspectionSourcePurchaseReceipt, QualityInspectionTypeIncoming, QualityInspectionSubjectMaterial, (*QualityInspectionUsecase).ListQualityInspections, QualityInspectionFilter{SourceType: QualityInspectionSourceShipment}},
		{"finished goods", QualityInspectionSourceShipment, QualityInspectionTypeFinishedGoods, QualityInspectionSubjectProduct, (*QualityInspectionUsecase).ListFinishedGoodsQualityInspections, QualityInspectionFilter{PurchaseReceiptID: 7}},
		{"outsourcing", QualityInspectionSourceOutsourcingFact, QualityInspectionTypeOutsourcingReturn, QualityInspectionSubjectProduct, (*QualityInspectionUsecase).ListOutsourcingReturnQualityInspections, QualityInspectionFilter{MaterialID: 7}},
		{"production", QualityInspectionSourceProductionWIP, QualityInspectionTypeProductionStage, QualityInspectionSubjectWIP, (*QualityInspectionUsecase).ListProductionStageQualityInspections, QualityInspectionFilter{InventoryLotID: 7}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &qualityInspectionBehaviorRepo{}
			uc := NewQualityInspectionUsecase(repo)
			rows, total, err := tc.call(uc, context.Background(), QualityInspectionFilter{Status: " passed ", Result: " pass ", Keyword: " 检验 ", Limit: 501, Offset: -1})
			if err != nil || total != 7 || len(rows) != 1 || rows[0].ID != 20 || len(repo.filters) != 1 {
				t.Fatalf("valid list lost result: rows=%v total=%d err=%v", rows, total, err)
			}
			got := repo.filters[0]
			if got.SourceType != tc.source || got.InspectionType != tc.kind || got.SubjectType != tc.subject || got.Status != QualityInspectionStatusPassed || got.Result != QualityInspectionResultPass || got.Keyword != "检验" || got.Limit != 50 || got.Offset != 0 {
				t.Fatalf("list crossed the inspection kind boundary: %#v", got)
			}
			from, to := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
			for _, filter := range []QualityInspectionFilter{tc.mixed, {DateFrom: &from, DateTo: &to}, {Status: "UNKNOWN"}, {Result: "UNKNOWN"}} {
				if _, _, err := tc.call(uc, context.Background(), filter); !errors.Is(err, ErrBadParam) || len(repo.filters) != 1 {
					t.Fatalf("invalid or cross-kind filter reached storage: filter=%#v err=%v", filter, err)
				}
			}
			repo.err = errors.New("quality list unavailable")
			if _, _, err := tc.call(uc, context.Background(), QualityInspectionFilter{}); !errors.Is(err, repo.err) {
				t.Fatalf("list failure must not look like an empty result: %v", err)
			}
		})
	}
}

func TestQualityInspectionUsecaseSubmissionAndCancellationPreserveStateGuards(t *testing.T) {
	repo := &qualityInspectionBehaviorRepo{err: ErrQualityInspectionSourceConflict}
	uc := NewQualityInspectionUsecase(repo)
	if _, err := uc.SubmitQualityInspection(context.Background(), 0); !errors.Is(err, ErrBadParam) || len(repo.submitted) != 0 {
		t.Fatalf("missing inspection reached submission: %v", err)
	}
	if _, err := uc.SubmitQualityInspection(context.Background(), 20); !errors.Is(err, ErrQualityInspectionSourceConflict) || !reflect.DeepEqual(repo.submitted, []int{20}) {
		t.Fatalf("submission bypassed the source state check: %v", err)
	}
	note := " 来源单据已取消 "
	if _, err := uc.CancelQualityInspection(context.Background(), 0, &note); !errors.Is(err, ErrBadParam) || len(repo.cancelled) != 0 {
		t.Fatalf("missing inspection reached cancellation: %v", err)
	}
	if _, err := uc.CancelQualityInspection(context.Background(), 20, &note); !errors.Is(err, ErrQualityInspectionSourceConflict) || repo.cancelNote == nil || *repo.cancelNote != "来源单据已取消" || note != " 来源单据已取消 " {
		t.Fatalf("cancellation lost conflict or changed caller note: %v", err)
	}
	repo.err = nil
	if got, err := uc.CancelQualityInspection(context.Background(), 20, &note); err != nil || got.Status != QualityInspectionStatusCancelled {
		t.Fatalf("cancellation retry failed: result=%v err=%v", got, err)
	}
}
