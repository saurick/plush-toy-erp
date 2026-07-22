package biz

import (
	"context"
	"errors"
	"sort"
	"strings"
)

// RoleDataScopeRepo is deliberately separated from AdminManageRepo so callers
// that only need the established admin control-plane contract do not gain an
// accidental unrestricted fallback. Runtime access checks require this
// capability explicitly and fail closed when it is unavailable.
type RoleDataScopeRepo interface {
	ListRoleDataScopesByRoleKeys(ctx context.Context, roleKeys []string) ([]RoleDataScope, error)
	SetRoleDataScopesWithAudit(ctx context.Context, change *RoleDataScopesChangeCommand) (*AdminRole, error)
}

const (
	DataScopeResourceWarehouse = "warehouse"

	DataScopeModeAll      = "ALL"
	DataScopeModeAssigned = "ASSIGNED"
	DataScopeModeNone     = "NONE"
)

var ErrDataScopeForbidden = errors.New("data scope forbidden")

type RoleDataScope struct {
	ResourceType string `json:"resource_type"`
	Mode         string `json:"mode"`
	ResourceIDs  []int  `json:"resource_ids"`
}

type RoleDataScopesChange struct {
	RoleKey         string
	OperatorID      int
	ExpectedVersion int
	Scopes          []RoleDataScope
}

// WarehouseDataScope is the effective role-union scope used by authenticated
// warehouse read paths. Missing policies and empty ASSIGNED policies normalize
// to NONE so callers cannot silently fall back to unrestricted reads.
type WarehouseDataScope struct {
	Mode         string
	WarehouseIDs []int
}

func NormalizeRoleDataScope(input RoleDataScope) (RoleDataScope, error) {
	resourceType := strings.ToLower(strings.TrimSpace(input.ResourceType))
	if resourceType != DataScopeResourceWarehouse {
		return RoleDataScope{}, ErrBadParam
	}
	mode := strings.ToUpper(strings.TrimSpace(input.Mode))
	if mode != DataScopeModeAll && mode != DataScopeModeAssigned && mode != DataScopeModeNone {
		return RoleDataScope{}, ErrBadParam
	}
	ids := normalizePositiveIDs(input.ResourceIDs)
	if mode == DataScopeModeAssigned && len(ids) == 0 {
		mode = DataScopeModeNone
	}
	if mode != DataScopeModeAssigned {
		ids = []int{}
	}
	return RoleDataScope{ResourceType: resourceType, Mode: mode, ResourceIDs: ids}, nil
}

func NormalizeRoleDataScopes(inputs []RoleDataScope) ([]RoleDataScope, error) {
	if len(inputs) != 1 {
		return nil, ErrBadParam
	}
	normalized, err := NormalizeRoleDataScope(inputs[0])
	if err != nil {
		return nil, err
	}
	return []RoleDataScope{normalized}, nil
}

func EffectiveWarehouseDataScope(superAdmin bool, roleScopes []RoleDataScope) WarehouseDataScope {
	if superAdmin {
		return WarehouseDataScope{Mode: DataScopeModeAll, WarehouseIDs: []int{}}
	}
	ids := []int{}
	for _, item := range roleScopes {
		normalized, err := NormalizeRoleDataScope(item)
		if err != nil || normalized.ResourceType != DataScopeResourceWarehouse {
			continue
		}
		if normalized.Mode == DataScopeModeAll {
			return WarehouseDataScope{Mode: DataScopeModeAll, WarehouseIDs: []int{}}
		}
		if normalized.Mode == DataScopeModeAssigned {
			ids = append(ids, normalized.ResourceIDs...)
		}
	}
	ids = normalizePositiveIDs(ids)
	if len(ids) == 0 {
		return WarehouseDataScope{Mode: DataScopeModeNone, WarehouseIDs: []int{}}
	}
	return WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: ids}
}

func (scope WarehouseDataScope) Allows(warehouseID int) bool {
	if warehouseID <= 0 {
		return false
	}
	switch strings.ToUpper(strings.TrimSpace(scope.Mode)) {
	case DataScopeModeAll:
		return true
	case DataScopeModeAssigned:
		index := sort.SearchInts(scope.WarehouseIDs, warehouseID)
		return index < len(scope.WarehouseIDs) && scope.WarehouseIDs[index] == warehouseID
	default:
		return false
	}
}

func (scope WarehouseDataScope) IsAll() bool {
	return strings.EqualFold(strings.TrimSpace(scope.Mode), DataScopeModeAll)
}

func NormalizeWarehouseDataScope(scope WarehouseDataScope) WarehouseDataScope {
	switch strings.ToUpper(strings.TrimSpace(scope.Mode)) {
	case DataScopeModeAll:
		return WarehouseDataScope{Mode: DataScopeModeAll, WarehouseIDs: []int{}}
	case DataScopeModeAssigned:
		ids := normalizePositiveIDs(scope.WarehouseIDs)
		if len(ids) > 0 {
			return WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: ids}
		}
	}
	return WarehouseDataScope{Mode: DataScopeModeNone, WarehouseIDs: []int{}}
}

func ValidateWarehouseDataScopeAccess(scope WarehouseDataScope, warehouseID int) error {
	if warehouseID > 0 && !NormalizeWarehouseDataScope(scope).Allows(warehouseID) {
		return ErrDataScopeForbidden
	}
	return nil
}

func normalizePositiveIDs(values []int) []int {
	seen := make(map[int]struct{}, len(values))
	out := make([]int, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Ints(out)
	return out
}
