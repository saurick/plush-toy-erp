package data

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/shopspring/decimal"
)

func assertBOMPrecisionDownstream(t *testing.T, data *Data, client *ent.Client, key string) {
	t.Helper()
	client.Use(unitQuantityGuard)
	ctx := t.Context()
	coefficient := decimal.RequireFromString("0.009090909090909")
	f := prepareMaterialRequestFixtureWithDemand(t, ctx, data, key, materialRequestDemand{ordered: "100", samples: "0", usage: coefficient.String(), loss: "0.1", precision: 0})
	preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
	if err != nil || len(preview.Issues) != 0 || len(preview.Sources) != 3 || len(preview.Items) != 2 {
		t.Fatalf("precision preview: %v, %#v", err, preview)
	}
	if preview.Items[0].RequiredQuantity.String() != "2" || preview.Items[1].RequiredQuantity.String() != "1" {
		t.Fatalf("coefficients were rounded before grouped unit rounding: %s, %s", preview.Items[0].RequiredQuantity, preview.Items[1].RequiredQuantity)
	}
	for _, source := range preview.Sources {
		if source["unit_usage"] != coefficient.String() || source["total_usage"] != "0.99999999999999" {
			t.Fatalf("source calculation lost precision: %#v", source)
		}
	}
	legacyPresentation := *preview
	legacyPresentation.Sources = make([]map[string]any, len(preview.Sources))
	for index, source := range preview.Sources {
		legacyPresentation.Sources[index] = make(map[string]any, len(source))
		for key, value := range source {
			legacyPresentation.Sources[index][key] = value
		}
		legacyPresentation.Sources[index]["total_usage"] = "1"
	}
	if engineeringMaterialSourceHash(&legacyPresentation) != preview.SourceHash {
		t.Fatal("display precision alone invalidated an existing approval")
	}
	saved, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11})
	if err != nil {
		t.Fatal(err)
	}
	saved, err = f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: saved.ID, ExpectedVersion: saved.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	saved, err = f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(saved))
	if err != nil {
		t.Fatal(err)
	}
	part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
	client.BOMItem.UpdateOneID(part.ID).SetQuantity(decimal.NewFromInt(9)).SaveX(ctx)
	read, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
	if err != nil || read.Status != biz.MaterialRequestApproved || read.SourceHash != saved.SourceHash || read.Sources[0]["total_usage"] != "0.99999999999999" {
		t.Fatalf("approved material request was recalculated: %v, %#v", err, read)
	}

	p := prepareProductionOrderRepoTest(t, key+"-production", data, client, func(ctx context.Context, client *ent.Client, unitID, bomID int) {
		client.Unit.UpdateOneID(unitID).SetPrecision(0).SaveX(ctx)
		line := client.SalesOrderItem.Query().Where(salesorderitem.UnitID(unitID)).OnlyX(ctx)
		client.SalesOrderItem.UpdateOneID(line.ID).SetOrderedQuantity(decimal.NewFromInt(100)).SaveX(ctx)
		part := client.BOMItem.Query().Where(bomitem.BomHeaderID(bomID)).OnlyX(ctx)
		client.BOMItem.UpdateOneID(part.ID).SetQuantity(coefficient).SaveX(ctx)
	})
	draft, err := p.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: p.draft(key+"-MO", 100), ActorID: p.actorID, IdempotencyKey: key + "-create"})
	if err != nil {
		t.Fatal(err)
	}
	action := &biz.ProductionOrderAction{ID: draft.Order.ID, ExpectedVersion: 1, ActorID: p.actorID, IdempotencyKey: key + "-release"}
	released, err := p.uc.Release(ctx, action)
	if err != nil || len(released.MaterialRequirements) != 1 {
		t.Fatalf("release: %v, %#v", err, released)
	}
	item := released.MaterialRequirements[0]
	if !item.UnitQuantitySnapshot.Equal(coefficient) || item.PlannedQuantity.String() != "1" {
		t.Fatalf("production snapshot was rounded early: %#v", item)
	}
	part = client.BOMItem.Query().Where(bomitem.BomHeaderID(p.bomID)).OnlyX(ctx)
	client.BOMItem.UpdateOneID(part.ID).SetQuantity(decimal.NewFromInt(9)).SaveX(ctx)
	replay, err := p.uc.Release(ctx, action)
	if err != nil || replay.MaterialRequirements[0].ID != item.ID || !replay.MaterialRequirements[0].UnitQuantitySnapshot.Equal(coefficient) || replay.MaterialRequirements[0].PlannedQuantity.String() != "1" {
		t.Fatalf("released production snapshot was recalculated: %v, %#v", err, replay)
	}
}

func TestBOMPrecisionDownstream(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "bom_precision_downstream")
	assertBOMPrecisionDownstream(t, data, client, "BOM-PRECISION")
}

func TestBOMPostgresPrecisionDownstream(t *testing.T) {
	data, client := openInventoryLotPostgresTestData(t)
	assertBOMPrecisionDownstream(t, data, client, "BOM-PRECISION-PG")
}
