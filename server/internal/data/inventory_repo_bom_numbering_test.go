package data

import (
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/bomheader"
)

func TestInventoryRepo_BOMAutomaticVersions(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryRepoTestData(t, "bom_automatic_versions")
	f := createInventoryTestFixtures(t, ctx, client)
	repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(repo)
	first := saveBOMDraftFixture(t, ctx, uc, f.productID)
	if first.Header.Version != "V1" {
		t.Fatalf("first: %s", first.Header.Version)
	}
	legacy := client.BOMHeader.Create().SetProductID(f.productID).SetVersion("v009").SetStatus(biz.BOMStatusArchived).SaveX(ctx)
	other := client.BOMHeader.Create().SetProductID(f.productID).SetVersion("打样版 A").SetStatus(biz.BOMStatusDraft).SetUpdatedAt(time.Now().UTC().Truncate(time.Microsecond)).SaveX(ctx)
	stored, err := uc.GetBOMVersion(ctx, other.ID)
	if err != nil {
		t.Fatal(err)
	}
	updated, err := uc.SaveBOMWithItems(ctx, other.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: stored.Header.EditVersion}, nil)
	if err != nil || updated.Header.Version != "打样版 A" {
		t.Fatalf("preserve existing label: %+v %v", updated, err)
	}
	copied, err := uc.CopyBOMVersion(ctx, legacy.ID, &biz.BOMHeaderCreate{ProductID: f.productID})
	if err != nil || copied.Header.Version != "V10" || copied.Header.Status != biz.BOMStatusDraft {
		t.Fatalf("copy: %+v %v", copied, err)
	}
	if got := client.BOMHeader.GetX(ctx, legacy.ID); got.Version != "v009" || got.Status != biz.BOMStatusArchived {
		t.Fatal("copy changed historical source")
	}
	updated, err = uc.SaveBOMWithItems(ctx, copied.Header.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: copied.Header.EditVersion}, nil)
	if err != nil || updated.Header.Version != "V10" {
		t.Fatalf("draft edit changed version: %+v %v", updated, err)
	}
	// A failure after allocation must roll back both the header and its number.
	if _, err := repo.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.NewFromInt(-1)}}}); err == nil {
		t.Fatal("expected item constraint failure")
	}
	next := saveBOMDraftFixture(t, ctx, uc, f.productID)
	if next.Header.Version != "V11" {
		t.Fatalf("rollback consumed version: %s", next.Header.Version)
	}
	product := createTestProduct(t, ctx, client, f.unitID, "PRD-BOM-NUMBER-SCOPE")
	if got := saveBOMDraftFixture(t, ctx, uc, product.ID); got.Header.Version != "V1" {
		t.Fatalf("product scope: %s", got.Header.Version)
	}
}

func TestBOMPostgresConcurrentAutomaticVersions(t *testing.T) {
	ctx := t.Context()
	data, client := openInventoryLotPostgresTestData(t)
	f := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	source := saveBOMDraftFixture(t, ctx, uc, f.productID)
	const writers = 12
	start := make(chan struct{})
	type result struct {
		version string
		err     error
	}
	results := make(chan result, writers)
	for index := range writers {
		go func() {
			<-start
			var detail *biz.BOMVersionDetail
			var err error
			if index%2 == 0 {
				detail, err = uc.CopyBOMVersion(ctx, source.Header.ID, &biz.BOMHeaderCreate{ProductID: f.productID})
			} else {
				detail, err = uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID}, nil)
			}
			if err != nil {
				results <- result{err: err}
				return
			}
			updated, err := uc.SaveBOMWithItems(ctx, detail.Header.ID, &biz.BOMVersionMutation{ProductID: f.productID, ExpectedVersion: detail.Header.EditVersion}, nil)
			if err != nil || updated.Header.Version != detail.Header.Version {
				results <- result{err: fmt.Errorf("edit allocated draft: %v", err)}
				return
			}
			results <- result{version: detail.Header.Version}
		}()
	}
	close(start)
	versions := map[string]bool{}
	for range writers {
		result := <-results
		if result.err != nil {
			t.Fatal(result.err)
		}
		if versions[result.version] {
			t.Fatalf("duplicate version: %s", result.version)
		}
		versions[result.version] = true
	}
	for index := 2; index <= writers+1; index++ {
		if !versions[fmt.Sprintf("V%d", index)] {
			t.Fatalf("missing V%d: %v", index, versions)
		}
	}
	if count := client.BOMHeader.Query().Where(bomheader.ProductID(f.productID)).CountX(ctx); count != writers+1 {
		t.Fatalf("headers: %d", count)
	}
}
