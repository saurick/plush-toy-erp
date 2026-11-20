package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

type salesOrderExportTestRepo struct {
	SalesOrderRepo
	read func(context.Context, SalesOrderExportQuery) ([]*SalesOrder, error)
}

func (r *salesOrderExportTestRepo) ExportSalesOrders(ctx context.Context, query SalesOrderExportQuery) ([]*SalesOrder, error) {
	return r.read(ctx, query)
}

func TestSalesOrderExportAdmissionCancellationAndPreparation(t *testing.T) {
	uc := NewSalesOrderUsecase(&salesOrderExportTestRepo{})
	releases := []func(){}
	for i := 0; i < SalesOrderExportConcurrency; i++ {
		ctx, release, err := uc.BeginSalesOrderExport(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > SalesOrderExportTimeout {
			t.Fatal("export deadline is not bounded")
		}
		releases = append(releases, release)
	}
	if _, _, err := uc.BeginSalesOrderExport(context.Background()); !errors.Is(err, ErrSalesOrderExportBusy) {
		t.Fatalf("admission=%v", err)
	}
	for _, release := range releases {
		release()
	}
	ctx, release, err := uc.BeginSalesOrderExport(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	release()
	if !errors.Is(ctx.Err(), context.Canceled) || len(uc.exportSlots) != 0 {
		t.Fatal("release retained resources")
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := uc.BeginSalesOrderExport(canceled); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled admission=%v", err)
	}
}

func TestSalesOrderExportFailureAndDeadline(t *testing.T) {
	for _, mode := range []string{"row limit", "read error", "deadline", "invalid filter"} {
		t.Run(mode, func(t *testing.T) {
			failure := errors.New("export fixture failure")
			readCalled := false
			repo := &salesOrderExportTestRepo{read: func(ctx context.Context, query SalesOrderExportQuery) ([]*SalesOrder, error) {
				readCalled = true
				if query.Filter.Offset != 0 {
					t.Fatal("export must not inherit list offset")
				}
				switch mode {
				case "row limit":
					return make([]*SalesOrder, SalesOrderExportMaxRows+1), nil
				case "read error":
					return nil, failure
				case "deadline":
					<-ctx.Done()
					return nil, ctx.Err()
				}
				return []*SalesOrder{{ID: 1}}, nil
			}}
			uc := NewSalesOrderUsecase(repo)
			ctx := context.Background()
			if mode == "deadline" {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, 20*time.Millisecond)
				defer cancel()
			}
			query := SalesOrderExportQuery{Filter: SalesOrderFilter{Offset: 200}}
			if mode == "invalid filter" {
				query.Filter.SortBy = "unsupported"
			}
			_, err := uc.ExportSalesOrders(ctx, query)
			want := failure
			switch mode {
			case "row limit":
				want = ErrSalesOrderExportLimit
			case "deadline":
				want = ErrSalesOrderExportTimeout
			case "invalid filter":
				want = ErrBadParam
			}
			if !errors.Is(err, want) || len(uc.exportSlots) != 0 || readCalled != (mode != "invalid filter") {
				t.Fatalf("err=%v want=%v read=%v slots=%d", err, want, readCalled, len(uc.exportSlots))
			}
		})
	}
}
