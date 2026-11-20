package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestBusinessProgressTaskSummaryPreservesAttentionAndOwnerSearch(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "progress_task_summary")
	checkProgressTaskSummary(t, data, client)
}

func TestBusinessDocumentSearchPostgresProgressTaskSummary(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	checkProgressTaskSummary(t, data, client)
}

func checkProgressTaskSummary(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := t.Context()
	prefix := fmt.Sprintf("PS-%x", time.Now().UnixNano())
	now := time.Date(2026, 11, 17, 4, 0, 0, 0, time.UTC)
	unit := createSalesOrderTestUnit(t, ctx, client, prefix, true)
	customer := createSalesOrderTestCustomer(t, ctx, client, prefix, true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, prefix, true)
	firstProduct := createSalesOrderTestProduct(t, ctx, client, unit.ID, prefix+"-FIRST", true)
	actor := client.AdminUser.Create().SetUsername(prefix).SetPasswordHash("fixture").SetDisplayName("跟进负责人").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo(prefix).SetCustomerID(customer.ID).SetOrderDate(now).SetLifecycleStatus("active").SaveX(ctx)
	for i, item := range []struct {
		id   int
		name string
	}{{product.ID, "Zeta"}, {firstProduct.ID, "Alpha"}} {
		client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(i + 1).SetProductID(item.id).SetProductNameSnapshot(item.name).SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)).SaveX(ctx)
	}
	task := func(suffix, status, role string, due *time.Time) *ent.WorkflowTask {
		b := client.WorkflowTask.Create().SetTaskCode(prefix + "-" + suffix).SetTaskName(suffix).SetTaskGroup("progress_summary").SetSourceType("sales_order").SetSourceID(order.ID).SetOwnerRoleKey(role).SetTaskStatusKey(status)
		if due != nil {
			b.SetDueAt(*due)
		}
		return b.SaveX(ctx)
	}
	old := now.Add(-48 * time.Hour)
	soon := now.Add(time.Hour)
	ready := task("ready-earlier", "ready", "pmc", &old)
	client.WorkflowTask.UpdateOneID(ready.ID).SetAssigneeID(actor.ID).SetBlockedReason("已失效的阻塞说明").SaveX(ctx)
	chosen := task("blocked-first", "blocked", "pmc", &soon)
	client.WorkflowTask.UpdateOneID(chosen.ID).SetBlockedReason("等待物料确认").SaveX(ctx)
	later := task("blocked-tied", "blocked", "pmc", &soon)
	undated := task("blocked-undated", "blocked", "pmc", nil)
	task("hidden-blocker", "blocked", "finance", &old)
	terminal := task("done-earlier", "done", "pmc", &old)
	client.WorkflowTask.UpdateOneID(terminal.ID).SetBlockedReason("终态旧说明").SaveX(ctx)

	uc := biz.NewBusinessProgressUsecase(NewBusinessProgressRepo(data))
	q := biz.BusinessProgressQuery{View: "orders", ID: order.ID, SnapshotAt: now, Limit: 1, Access: biz.BusinessProgressAccess{Sales: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"pmc"}}}
	read := func(query biz.BusinessProgressQuery) *biz.BusinessProgressRow {
		t.Helper()
		board, err := uc.List(ctx, query)
		if err != nil || board.Total != 1 || len(board.Rows) != 1 {
			t.Fatalf("progress row missing: total=%v err=%v", board, err)
		}
		return board.Rows[0]
	}
	row := read(q)
	if row.ProductID != firstProduct.ID || row.Product != "Alpha" || row.OpenTasks != 4 || row.BlockedTasks != 3 || row.UnassignedTasks != 3 || row.AttentionTaskID != chosen.ID || row.AttentionReason != "等待物料确认" || row.AttentionOwner != "" {
		t.Fatalf("summary must preserve counts, product ordering and the first blocked task: %+v", row)
	}
	q.Owner = "跟进负责人"
	if row = read(q); row.AttentionTaskID != chosen.ID {
		t.Fatal("owner search must match a visible secondary task without replacing the attention task")
	}
	q.Owner = ""
	q.Keyword = "跟进负责人"
	if row = read(q); row.AttentionTaskID != chosen.ID {
		t.Fatal("keyword search must keep the attention task")
	}
	q.Keyword = ""
	q.Owner = "finance"
	board, err := uc.List(ctx, q)
	if err != nil || board.Total != 0 || len(board.Rows) != 0 {
		t.Fatal("hidden owner role must not make the order match")
	}
	q.Owner = ""
	for _, id := range []int{chosen.ID, later.ID, undated.ID} {
		client.WorkflowTask.UpdateOneID(id).SetTaskStatusKey("done").SaveX(ctx)
	}
	row = read(q)
	if row.AttentionTaskID != ready.ID || row.AttentionOwner != "跟进负责人" || row.AttentionReason != "" || row.Blocked || row.OpenTasks != 1 {
		t.Fatalf("ready task must clear stale blocking data: %+v", row)
	}
	client.WorkflowTask.UpdateOneID(ready.ID).SetTaskStatusKey("done").SaveX(ctx)
	row = read(q)
	if row.AttentionTaskID != 0 || row.AttentionTask != "" || row.AttentionReason != "" || row.AttentionOwner != "" || row.AttentionRole != "" || row.OpenTasks != 0 || row.UnassignedTasks != 0 {
		t.Fatalf("terminal tasks must leave attention empty: %+v", row)
	}
}

func TestBusinessDocumentSearchPostgresProgressGrowthKeepsTaskScansBounded(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := t.Context()
	prefix := fmt.Sprintf("PG-%x", time.Now().UnixNano())
	now := time.Date(2026, 11, 17, 4, 0, 0, 0, time.UTC)
	unit := createSalesOrderTestUnit(t, ctx, client, prefix, true)
	customer := createSalesOrderTestCustomer(t, ctx, client, prefix, true)
	product := createSalesOrderTestProduct(t, ctx, client, unit.ID, prefix, true)
	const orderCount = 1000
	for offset := 0; offset < orderCount; offset += 100 {
		builders := make([]*ent.SalesOrderCreate, 100)
		for i := range builders {
			builders[i] = client.SalesOrder.Create().SetOrderNo(fmt.Sprintf("%s-%04d", prefix, offset+i)).SetCustomerID(customer.ID).SetOrderDate(now).SetLifecycleStatus("active")
		}
		orders := client.SalesOrder.CreateBulk(builders...).SaveX(ctx)
		lines := make([]*ent.SalesOrderItemCreate, 0, len(orders))
		tasks := make([]*ent.WorkflowTaskCreate, 0, len(orders)*7)
		for _, order := range orders {
			lines = append(lines, client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetProductNameSnapshot("增长验证产品").SetUnitID(unit.ID).SetOrderedQuantity(decimal.NewFromInt(1)))
			for i := 0; i < 7; i++ {
				status, role := "ready", "pmc"
				if i == 0 {
					status = "blocked"
				}
				if i == 6 {
					role = "finance"
				}
				tasks = append(tasks, client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("%s-%d-%d", prefix, order.ID, i)).SetTaskName("增长验证待办").SetTaskGroup("progress_growth").SetSourceType("sales_order").SetSourceID(order.ID).SetTaskStatusKey(status).SetOwnerRoleKey(role))
			}
		}
		client.SalesOrderItem.CreateBulk(lines...).SaveX(ctx)
		client.WorkflowTask.CreateBulk(tasks...).SaveX(ctx)
	}
	repo := &businessProgressRepo{data: data}
	uc := biz.NewBusinessProgressUsecase(repo)
	q := biz.BusinessProgressQuery{View: "orders", Scope: "active", DueStatus: "all", Keyword: prefix, SnapshotAt: now, Limit: 20, Access: biz.BusinessProgressAccess{Sales: true, Tasks: true}, TaskVisibility: &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"pmc"}}}
	var totalTasks int
	if err := data.sqldb.QueryRowContext(ctx, "SELECT count(*) FROM workflow_tasks").Scan(&totalTasks); err != nil {
		t.Fatal(err)
	}
	for _, analyzed := range []bool{false, true} {
		if analyzed {
			if _, err := data.sqldb.ExecContext(ctx, "ANALYZE"); err != nil {
				t.Fatal(err)
			}
		}
		for _, owner := range []string{"", "pmc"} {
			q.Owner = owner
			start := time.Now()
			board, err := uc.List(ctx, q)
			if err != nil {
				t.Fatal(err)
			}
			if board.Total != orderCount || len(board.Rows) != q.Limit || board.Counts.Blocked != orderCount {
				t.Fatalf("growth must preserve total, page and blocked counts: total=%d rows=%d blocked=%d", board.Total, len(board.Rows), board.Counts.Blocked)
			}
			for _, row := range board.Rows {
				if row.OpenTasks != 6 || row.BlockedTasks != 1 || row.AttentionTaskID == 0 {
					t.Fatal("growth summary mixed hidden tasks or lost attention")
				}
			}
			t.Logf("orders=%d tasks=%d analyzed=%t owner_filter=%t page=%d elapsed=%s", orderCount, totalTasks, analyzed, owner != "", len(board.Rows), time.Since(start))
			cte, args := progressQuery(q, data.sqlDialect)
			planCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			var raw []byte
			err = repo.readProgress(planCtx, q, func(tx *sql.Tx) error {
				return tx.QueryRowContext(planCtx, "EXPLAIN (ANALYZE, FORMAT JSON) "+cte+progressCountsSQL(q), args...).Scan(&raw)
			})
			cancel()
			if err != nil {
				t.Fatal(err)
			}
			var plans []struct {
				Plan          map[string]any
				ExecutionTime float64 `json:"Execution Time"`
				JIT           struct{ Timing struct{ Total float64 } }
			}
			if err = json.Unmarshal(raw, &plans); err != nil || len(plans) != 1 {
				t.Fatalf("invalid execution plan: %v", err)
			}
			t.Logf("owner_filter=%t execution_ms=%.1f jit_ms=%.1f", owner != "", plans[0].ExecutionTime, plans[0].JIT.Timing.Total)
			var inspect func(map[string]any)
			inspect = func(node map[string]any) {
				if node["Node Type"] == "CTE Scan" {
					loops, _ := node["Actual Loops"].(float64)
					rows, _ := node["Actual Rows"].(float64)
					removed, _ := node["Rows Removed by Filter"].(float64)
					if visited := loops * (rows + removed); visited > float64(totalTasks*12) {
						t.Errorf("CTE %s repeatedly scans the task-sized result: visits=%.0f budget=%d", node["CTE Name"], visited, totalTasks*12)
					}
				}
				if children, ok := node["Plans"].([]any); ok {
					for _, child := range children {
						inspect(child.(map[string]any))
					}
				}
			}
			inspect(plans[0].Plan)
		}
	}
	concurrentCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	q.Owner = ""
	type sample struct {
		elapsed time.Duration
		err     error
	}
	const workers, repeats = 8, 3
	results := make(chan sample, workers*repeats)
	for range workers {
		go func() {
			for range repeats {
				start := time.Now()
				board, err := uc.List(concurrentCtx, q)
				if err == nil && (board.Total != orderCount || len(board.Rows) != q.Limit || board.Counts.Blocked != orderCount) {
					err = errors.New("concurrent progress read changed counts or pagination")
				}
				results <- sample{time.Since(start), err}
			}
		}()
	}
	durations := make([]time.Duration, 0, workers*repeats)
	for range workers * repeats {
		result := <-results
		if result.err != nil {
			t.Errorf("concurrent progress read: %v", result.err)
		}
		durations = append(durations, result.elapsed)
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	t.Logf("concurrency=%d samples=%d p50_ms=%.1f p95_ms=%.1f", workers, len(durations), float64(durations[len(durations)/2].Microseconds())/1000, float64(durations[(len(durations)*95+99)/100-1].Microseconds())/1000)
}

func TestBusinessDocumentSearchPostgresProgressReadSettingsStayLocal(t *testing.T) {
	data, _ := openInventoryPostgresTestData(t)
	data.sqldb.SetMaxOpenConns(1)
	data.sqldb.SetMaxIdleConns(1)
	ctx := t.Context()
	for _, setting := range []string{"SET enable_nestloop = on", "SET jit = on"} {
		if _, err := data.sqldb.ExecContext(ctx, setting); err != nil {
			t.Fatal(err)
		}
	}
	repo := &businessProgressRepo{data: data}
	q := biz.BusinessProgressQuery{View: "orders", Limit: 20}
	stopped := errors.New("stop read snapshot")
	for _, outcome := range []string{"success", "error", "canceled"} {
		readCtx, cancel := context.WithCancel(ctx)
		err := repo.readProgress(readCtx, q, func(tx *sql.Tx) error {
			var loops, jit, readonly string
			if err := tx.QueryRowContext(readCtx, "SELECT current_setting('enable_nestloop'),current_setting('jit'),current_setting('transaction_read_only')").Scan(&loops, &jit, &readonly); err != nil {
				return err
			}
			if loops != "off" || jit != "off" || readonly != "on" {
				t.Fatalf("aggregate policy was not confined to a read-only snapshot: %s %s %s", loops, jit, readonly)
			}
			switch outcome {
			case "error":
				return stopped
			case "canceled":
				cancel()
				return readCtx.Err()
			default:
				return nil
			}
		})
		cancel()
		if outcome == "success" && err != nil || outcome == "error" && !errors.Is(err, stopped) || outcome == "canceled" && !errors.Is(err, context.Canceled) {
			t.Fatalf("snapshot outcome %s: %v", outcome, err)
		}
		var loops, jit string
		if err := data.sqldb.QueryRowContext(ctx, "SELECT current_setting('enable_nestloop'),current_setting('jit')").Scan(&loops, &jit); err != nil {
			t.Fatal(err)
		}
		if loops != "on" || jit != "on" {
			t.Fatalf("snapshot policy leaked after %s: %s %s", outcome, loops, jit)
		}
	}
	q.ID = 1
	if err := repo.readProgress(ctx, q, func(tx *sql.Tx) error {
		var loops, jit string
		if err := tx.QueryRowContext(ctx, "SELECT current_setting('enable_nestloop'),current_setting('jit')").Scan(&loops, &jit); err != nil {
			return err
		}
		if loops != "on" || jit != "off" {
			t.Fatal("keyed detail should retain nested loops and the shared snapshot JIT policy")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
