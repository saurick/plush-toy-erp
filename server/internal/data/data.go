// server/internal/data/data.go
package data

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	"server/internal/customertrialconfig"
	"server/internal/data/model/ent"
	_ "server/internal/data/model/ent/runtime"
	entLogger "server/pkg/logger"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/XSAM/otelsql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/google/wire"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// ProviderSet 是 data 层对外暴露的依赖注入集合。
var ProviderSet = wire.NewSet(
	NewData,

	// admin auth / manage
	NewAdminAuthRepo,
	wire.Bind(new(biz.AdminAuthRepo), new(*adminAuthRepo)),
	wire.Bind(new(biz.AdminAccountReader), new(*adminAuthRepo)),
	NewAdminTokenGenerator,
	NewAdminTokenParser,
	NewSMSLoginCodeProvider,
	NewAdminManageRepo,
	wire.Bind(new(biz.AdminManageRepo), new(*adminManageRepo)),

	// domain repos
	NewWorkflowRepo,
	wire.Bind(new(biz.WorkflowRepo), new(*workflowRepo)),
	NewProcessRuntimeRepo,
	wire.Bind(new(biz.ProcessRuntimeRepo), new(*processRuntimeRepo)),
	NewDebugSeedRepo,
	wire.Bind(new(biz.DebugRepo), new(*debugSeedRepo)),
	NewDebugSafetyConfig,
	NewMasterDataRepo,
	wire.Bind(new(biz.MasterDataRepo), new(*masterDataRepo)),
	NewSalesOrderRepo,
	wire.Bind(new(biz.SalesOrderRepo), new(*salesOrderRepo)),
	NewPurchaseOrderRepo,
	wire.Bind(new(biz.PurchaseOrderRepo), new(*purchaseOrderRepo)),
	NewProductionOrderRepo,
	wire.Bind(new(biz.ProductionOrderRepo), new(*productionOrderRepo)),
	NewOutsourcingOrderRepo,
	wire.Bind(new(biz.OutsourcingOrderRepo), new(*outsourcingOrderRepo)),
	NewInventoryRepo,
	wire.Bind(new(biz.InventoryRepo), new(*inventoryRepo)),
	NewOperationalFactRepo,
	wire.Bind(new(biz.OperationalFactRepo), new(*operationalFactRepo)),
	NewBusinessAttachmentRepo,
	wire.Bind(new(biz.BusinessAttachmentRepo), new(*businessAttachmentRepo)),
	NewCustomerConfigRepo,
	wire.Bind(new(biz.CustomerConfigRepo), new(*customerConfigRepo)),
)

// Data 聚合 DB 等外部资源。
type Data struct {
	log        *log.Helper
	postgres   *ent.Client
	sqldb      *sql.DB
	sqlDialect string
	conf       *conf.Data
}

const (
	postgresDriverName    = "pgx"
	postgresReadyTimeout  = 60 * time.Second
	postgresRetryInterval = 2 * time.Second
)

func postgresSQLSpanOptions() otelsql.SpanOptions {
	// SQL text and bind args may contain customer data, credentials, or business payloads; keep them out of traces.
	return otelsql.SpanOptions{
		DisableQuery:         true,
		OmitConnResetSession: true,
		OmitConnPrepare:      true,
		OmitConnQuery:        false,
		OmitRows:             true,
		OmitConnectorConnect: true,
	}
}

type pingContexter interface {
	PingContext(ctx context.Context) error
}

// waitForPostgresReady 在启动阶段为数据库预留短暂恢复窗口，避免宿主机重启后的瞬时连接拒绝导致应用直接退出。
func waitForPostgresReady(ctx context.Context, pinger pingContexter, interval time.Duration, l *log.Helper) error {
	if interval <= 0 {
		interval = time.Second
	}

	attempt := 0
	var lastErr error
	for {
		attempt++
		if err := pinger.PingContext(ctx); err == nil {
			if attempt > 1 {
				l.Infof("postgres ready after retry, attempt=%d", attempt)
			}
			return nil
		} else {
			lastErr = err
			l.Warnf("postgres not ready yet, attempt=%d err=%v", attempt, err)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("postgres not ready before timeout: %w, last_err=%v", ctx.Err(), lastErr)
		case <-time.After(interval):
		}
	}
}

// SQLDB 返回底层 DB，用于健康检查与原生 SQL 查询。
func (d *Data) SQLDB() *sql.DB {
	return d.sqldb
}

// NewDataForTesting 为跨包测试包装 Ent client，避免为了 repo 测试启动 Postgres。
func NewDataForTesting(client *ent.Client, db *sql.DB) *Data {
	return &Data{
		postgres:   client,
		sqldb:      db,
		sqlDialect: dialect.SQLite,
	}
}

// NewData 由 wire 调用，用来统一管理资源和 cleanup。
func NewData(c *conf.Data, logger log.Logger) (*Data, func(), error) {
	l := log.NewHelper(log.With(logger, "logger.name", "data"))

	l.Info("init postgres(otelsql) start...")
	db, err := otelsql.Open(
		postgresDriverName,
		c.Postgres.Dsn,
		otelsql.WithSpanOptions(postgresSQLSpanOptions()),
	)
	if err != nil {
		l.Errorf("failed to open postgres connection: %v", err)
		return nil, nil, err
	}

	// 启动兜底：给 Postgres 预留就绪窗口，避免重启后短暂不可达直接触发 panic。
	pingCtx, cancelPing := context.WithTimeout(context.Background(), postgresReadyTimeout)
	defer cancelPing()
	if err := waitForPostgresReady(pingCtx, db, postgresRetryInterval, l); err != nil {
		_ = db.Close()
		l.Errorf("postgres ping failed: %v", err)
		return nil, nil, err
	}
	l.Info("init postgres(otelsql) done")

	trialConfigEnabled, err := customertrialconfig.ResolveGate(c.Postgres.Dsn, os.Getenv)
	if err != nil {
		_ = db.Close()
		return nil, nil, err
	}
	if err := validateActiveCustomerTrialConfig(context.Background(), db, trialConfigEnabled, c.Postgres.Dsn); err != nil {
		_ = db.Close()
		return nil, nil, err
	}

	postgresClient := ent.NewClient(
		ent.Log(entLogger.NewEntLogger(logger)),
		ent.Driver(entsql.OpenDB(dialect.Postgres, db)),
	)
	if postgresClient == nil {
		_ = db.Close()
		return nil, nil, fmt.Errorf("failed to create postgres client")
	}

	if c.Postgres.Debug {
		postgresClient = postgresClient.Debug()
	}

	data := &Data{
		log:        l,
		sqldb:      db,
		sqlDialect: dialect.Postgres,
		postgres:   postgresClient,
		conf:       c,
	}

	if err := InitRBACIfNeeded(context.Background(), data, l); err != nil {
		return nil, nil, err
	}
	if err := InitAdminUsersIfNeeded(context.Background(), data, c, l); err != nil {
		return nil, nil, err
	}

	cleanup := func() {
		if postgresClient != nil {
			_ = postgresClient.Close()
		}
		if db != nil {
			_ = db.Close()
		}
	}

	return data, cleanup, nil
}
