// This local command has no network listener and exposes only a read-only snapshot.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data"
	"server/internal/devdbguard"
	"server/internal/service"
)

func main() {
	if err := run(os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(output io.Writer) error {
	if len(os.Args) != 1 {
		return errors.New("permission snapshot accepts no arguments")
	}
	dsn := os.Getenv("POSTGRES_DSN")
	// This is deliberately stricter than the generic dev guard: browser requests
	// cannot select arbitrary databases, targets or test-database exceptions.
	if err := devdbguard.RequireCustomerConfigLocalTestDSN(dsn); err != nil {
		return errors.New("permission snapshot requires the registered development database")
	}
	if err := devdbguard.VerifyRegisteredDevelopmentRuntime(dsn); err != nil {
		return errors.New("development database identity could not be verified")
	}
	customerKey := strings.TrimSpace(os.Getenv("ERP_CUSTOMER_KEY"))
	if customerKey == "" || biz.NormalizeCustomerKey(customerKey) != customerKey {
		return errors.New("local runtime customer identity is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	logger := log.NewStdLogger(io.Discard)
	db, cleanup, err := data.NewReadOnlyData(ctx, dsn, logger)
	if err != nil {
		return errors.New("development permission data is unavailable")
	}
	defer cleanup()
	adminRepo := data.NewAdminManageRepo(db, logger)
	accounts, err := adminRepo.ListAdmins(ctx)
	if err != nil {
		return errors.New("cannot read development account relationships")
	}
	roles, err := adminRepo.ListRoles(ctx)
	if err != nil {
		return errors.New("cannot read development roles")
	}
	permissions, err := adminRepo.ListPermissions(ctx)
	if err != nil {
		return errors.New("cannot read development permissions")
	}
	masterRepo := data.NewMasterDataRepo(db, logger)
	warehouses := []*biz.Warehouse{}
	for offset := 0; ; {
		rows, total, err := masterRepo.ListWarehouses(ctx, biz.MasterDataFilter{Limit: 1000, Offset: offset})
		if err != nil {
			return errors.New("cannot read development warehouse scope")
		}
		warehouses = append(warehouses, rows...)
		offset += len(rows)
		if offset >= total {
			break
		}
		if len(rows) == 0 {
			return errors.New("development warehouse scope is incomplete")
		}
	}
	configUC := biz.NewCustomerConfigUsecaseForWire(data.NewCustomerConfigRepo(db, logger), adminRepo)
	access := make(map[string]*biz.RoleEffectiveAccessExplanation, len(roles))
	for _, role := range roles {
		explanation, err := configUC.ExplainRoleEffectiveAccess(ctx, customerKey, role, customerKey != biz.DefaultCustomerKey)
		if err != nil {
			return errors.New("cannot explain development role access")
		}
		access[role.Key] = explanation
	}
	approval, err := configUC.GetApprovalSettings(ctx, customerKey)
	if err != nil && !errors.Is(err, biz.ErrCustomerConfigNotFound) {
		return errors.New("cannot read development approval responsibilities")
	}
	snapshot := service.PermissionRelationshipSnapshot(accounts, roles, permissions, warehouses, access, approval)
	snapshot["read_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	snapshot["customer_key"] = customerKey
	snapshot["source"] = "local_development_read_only"
	return json.NewEncoder(output).Encode(snapshot)
}
