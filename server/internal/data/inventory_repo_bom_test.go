package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_BOMHeaderAndItems(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID:     fixtures.productID,
		Version:       "V1",
		Status:        biz.BOMStatusDraft,
		SourceOrderNo: stringPtr("WL260102"),
		QuantityText:  stringPtr("3030"),
		SpareText:     stringPtr("备品 30"),
		Designer:      stringPtr("罗伟"),
		Maker:         stringPtr("成慧怡"),
		Auditor:       stringPtr("审核人"),
		HairDirection: stringPtr("单方向"),
	})
	if err != nil {
		t.Fatalf("create bom header failed: %v", err)
	}
	if header.Status != biz.BOMStatusDraft {
		t.Fatalf("expected draft bom header, got %s", header.Status)
	}
	if header.ItemCount != nil {
		t.Fatalf("create response must not report an unloaded list item count: %#v", header.ItemCount)
	}
	defaultDraft, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "DEFAULT-DRAFT",
	})
	if err != nil || defaultDraft.Status != biz.BOMStatusDraft {
		t.Fatalf("expected omitted BOM status to default to DRAFT, header=%#v err=%v", defaultDraft, err)
	}
	for index, status := range []string{biz.BOMStatusActive, biz.BOMStatusArchived, "DISABLED", "UNKNOWN"} {
		if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
			ProductID: fixtures.productID,
			Version:   "NON-DRAFT-" + string(rune('A'+index)),
			Status:    status,
		}); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("expected normal BOM create with status %s rejected, got %v", status, err)
		}
	}
	if header.SourceOrderNo == nil || *header.SourceOrderNo != "WL260102" || header.Designer == nil || *header.Designer != "罗伟" {
		t.Fatalf("expected BOM engineering header fields, got %#v", header)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusDraft,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected product/version unique constraint, got %v", err)
	}
	draftHeader, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V2",
		Status:    biz.BOMStatusDraft,
	})
	if err != nil {
		t.Fatalf("expected draft BOM with different version to be allowed, got %v", err)
	}
	position := "face"
	item, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID:        header.ID,
		MaterialID:         fixtures.materialID,
		Quantity:           mustDecimal(t, "1.250000"),
		UnitID:             fixtures.unitID,
		LossRate:           mustDecimal(t, "0.100000"),
		Position:           &position,
		PieceCount:         stringPtr("2"),
		TotalUsageSnapshot: stringPtr("378.75"),
		ProcessBase:        stringPtr("布底贴12g纸朴"),
		ProcessMethod:      stringPtr("热裁"),
	})
	if err != nil {
		t.Fatalf("create bom item failed: %v", err)
	}
	assertDecimalEqual(t, item.Quantity, "1.250000")
	assertDecimalEqual(t, item.LossRate, "0.100000")
	if item.PieceCount == nil || *item.PieceCount != "2" || item.ProcessMethod == nil || *item.ProcessMethod != "热裁" {
		t.Fatalf("expected BOM engineering item fields, got %#v", item)
	}
	headers, total, err := uc.ListBOMHeaders(ctx, biz.BOMHeaderFilter{ProductID: fixtures.productID, Limit: 20})
	if err != nil || total != 3 || len(headers) != 3 {
		t.Fatalf("list BOM headers=%#v total=%d err=%v", headers, total, err)
	}
	counts := make(map[int]int, len(headers))
	for _, listed := range headers {
		if listed.ItemCount == nil {
			t.Fatalf("list BOM header %d has unknown item count", listed.ID)
		}
		counts[listed.ID] = *listed.ItemCount
	}
	if counts[header.ID] != 1 || counts[defaultDraft.ID] != 0 || counts[draftHeader.ID] != 0 {
		t.Fatalf("list BOM item counts=%#v, want populated=1 and empty drafts=0", counts)
	}

	activated, err := uc.ActivateBOMVersion(ctx, header.ID)
	if err != nil {
		t.Fatalf("activate bom failed: %v", err)
	}
	if activated.Header.Status != biz.BOMStatusActive || len(activated.Items) != 1 {
		t.Fatalf("expected active bom with one item, got %#v", activated)
	}
	if replayed, err := uc.ActivateBOMVersion(ctx, header.ID); err != nil || replayed.Header.ID != header.ID || replayed.Header.Status != biz.BOMStatusActive {
		t.Fatalf("expected activating ACTIVE BOM to be idempotent, detail=%#v err=%v", replayed, err)
	}
	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBOMActiveImmutable) {
		t.Fatalf("expected active BOM item mutation to be rejected, got %v", err)
	}

	activeHeader, err := uc.GetActiveBOMByProduct(ctx, fixtures.productID)
	if err != nil {
		t.Fatalf("get active bom failed: %v", err)
	}
	if activeHeader.ID != header.ID {
		t.Fatalf("expected active bom id %d, got %d", header.ID, activeHeader.ID)
	}

	items, err := uc.ListBOMItemsByProduct(ctx, fixtures.productID)
	if err != nil {
		t.Fatalf("list active bom items failed: %v", err)
	}
	if len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("expected one active bom item id=%d, got %#v", item.ID, items)
	}

	lifecycleProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-BOM-LIFECYCLE")
	lifecycleHeader, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: lifecycleProduct.ID,
		Version:   "V1",
	})
	if err != nil {
		t.Fatalf("create lifecycle BOM draft: %v", err)
	}
	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: lifecycleHeader.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); err != nil {
		t.Fatalf("create lifecycle BOM item: %v", err)
	}
	archivedDraft, err := uc.ArchiveBOMVersion(ctx, lifecycleHeader.ID)
	if err != nil || archivedDraft.Status != biz.BOMStatusArchived {
		t.Fatalf("expected DRAFT to archive, header=%#v err=%v", archivedDraft, err)
	}
	if replayed, err := uc.ArchiveBOMVersion(ctx, lifecycleHeader.ID); err != nil || replayed.Status != biz.BOMStatusArchived {
		t.Fatalf("expected archiving ARCHIVED BOM to be idempotent, header=%#v err=%v", replayed, err)
	}
	reactivated, err := uc.ActivateBOMVersion(ctx, lifecycleHeader.ID)
	if err != nil || reactivated.Header.Status != biz.BOMStatusActive {
		t.Fatalf("expected ARCHIVED BOM to reactivate, detail=%#v err=%v", reactivated, err)
	}
	if archivedActive, err := uc.ArchiveBOMVersion(ctx, lifecycleHeader.ID); err != nil || archivedActive.Status != biz.BOMStatusArchived {
		t.Fatalf("expected ACTIVE BOM to archive, header=%#v err=%v", archivedActive, err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: draftHeader.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    decimal.Zero,
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: draftHeader.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "-0.01"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected loss_rate < 0 to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: draftHeader.ID,
		MaterialID:  999999,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrMaterialNotFound) {
		t.Fatalf("expected missing material to be rejected, got %v", err)
	}

	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: draftHeader.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      999999,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrUnitNotFound) {
		t.Fatalf("expected missing unit to be rejected, got %v", err)
	}

	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(decimal.Zero).
		SetUnitID(fixtures.unitID).
		SetLossRate(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for quantity > 0, got %v", err)
	}
	if _, err := client.BOMItem.Create().
		SetBomHeaderID(header.ID).
		SetMaterialID(fixtures.materialID).
		SetQuantity(mustDecimal(t, "1")).
		SetUnitID(fixtures.unitID).
		SetLossRate(mustDecimal(t, "-0.01")).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for loss_rate >= 0, got %v", err)
	}
	if _, err := client.BOMHeader.Create().
		SetProductID(fixtures.productID).
		SetVersion("UNKNOWN-STATUS").
		SetStatus("UNKNOWN").
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for known BOM status, got %v", err)
	}
	from := time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)
	to := from.Add(-24 * time.Hour)
	if _, err := client.BOMHeader.Create().
		SetProductID(fixtures.productID).
		SetVersion("INVALID-DATES").
		SetStatus(biz.BOMStatusDraft).
		SetEffectiveFrom(from).
		SetEffectiveTo(to).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected DB check constraint for ordered BOM effective dates, got %v", err)
	}
}

func TestInventoryUsecase_BOMRejectsInactiveNewReferencesAndKeepsArchiveAllowed(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_bom_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	header, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "ACTIVE-V1",
		Status:    biz.BOMStatusDraft,
	})
	if err != nil {
		t.Fatalf("create bom header failed: %v", err)
	}
	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); err != nil {
		t.Fatalf("create bom item failed: %v", err)
	}
	if _, err := uc.ActivateBOMVersion(ctx, header.ID); err != nil {
		t.Fatalf("activate bom failed: %v", err)
	}

	if _, err := client.Product.UpdateOneID(fixtures.productID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "NEW-V2",
		Status:    biz.BOMStatusDraft,
	}); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("expected inactive product rejected for new bom, got %v", err)
	}
	if archived, err := uc.ArchiveBOMVersion(ctx, header.ID); err != nil {
		t.Fatalf("archive existing active bom should not be blocked by inactive product: %v", err)
	} else if archived.Status != biz.BOMStatusArchived {
		t.Fatalf("expected archived bom, got %s", archived.Status)
	}

	activeProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-BOM-ACTIVE")
	draft, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: activeProduct.ID,
		Version:   "DRAFT-V1",
		Status:    biz.BOMStatusDraft,
	})
	if err != nil {
		t.Fatalf("create active product bom header failed: %v", err)
	}
	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material failed: %v", err)
	}
	if _, err := uc.CreateBOMItem(ctx, &biz.BOMItemCreate{
		BOMHeaderID: draft.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1"),
		UnitID:      fixtures.unitID,
		LossRate:    decimal.Zero,
	}); !errors.Is(err, biz.ErrMaterialInactive) {
		t.Fatalf("expected inactive material rejected for new bom item, got %v", err)
	}
}
