package data

import (
	"context"
	"errors"
	"io"
	"testing"

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
		ProductID: fixtures.productID,
		Version:   "V1",
		Status:    biz.BOMStatusDraft,
	})
	if err != nil {
		t.Fatalf("create bom header failed: %v", err)
	}
	if header.Status != biz.BOMStatusDraft {
		t.Fatalf("expected draft bom header, got %s", header.Status)
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
		BOMHeaderID: header.ID,
		MaterialID:  fixtures.materialID,
		Quantity:    mustDecimal(t, "1.250000"),
		UnitID:      fixtures.unitID,
		LossRate:    mustDecimal(t, "0.100000"),
		Position:    &position,
	})
	if err != nil {
		t.Fatalf("create bom item failed: %v", err)
	}
	assertDecimalEqual(t, item.Quantity, "1.250000")
	assertDecimalEqual(t, item.LossRate, "0.100000")

	activated, err := uc.ActivateBOMVersion(ctx, header.ID)
	if err != nil {
		t.Fatalf("activate bom failed: %v", err)
	}
	if activated.Header.Status != biz.BOMStatusActive || len(activated.Items) != 1 {
		t.Fatalf("expected active bom with one item, got %#v", activated)
	}
	if _, err := uc.CreateBOMHeader(ctx, &biz.BOMHeaderCreate{
		ProductID: fixtures.productID,
		Version:   "V3",
		Status:    biz.BOMStatusActive,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected one ACTIVE BOM per product constraint, got %v", err)
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
