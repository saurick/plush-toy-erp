package service

import (
	"io"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
)

func approvalSettingsParamsForTest() map[string]any {
	return map[string]any{
		"customer_key":             "yoyoosun",
		"revision":                 "approval-rev-2",
		"expected_active_revision": "approval-rev-1",
		"expected_active_hash":     "hash-1",
		"items": []any{
			map[string]any{
				"approval_key": "sales_order",
				"enabled":      true,
				"members": []any{
					map[string]any{
						"role_key": "sales",
						"user_id":  float64(12),
						"strategy": "primary",
						"enabled":  true,
					},
				},
			},
		},
	}
}

func TestApprovalSettingsRevisionInputRequiresExactCASAndMembers(t *testing.T) {
	in, ok := approvalSettingsRevisionInputFromParams(approvalSettingsParamsForTest())
	if !ok {
		t.Fatal("expected valid approval settings input")
	}
	if in.ExpectedActiveRevision != "approval-rev-1" || in.ExpectedActiveHash != "hash-1" ||
		len(in.Items) != 1 || len(in.Items[0].Members) != 1 || in.Items[0].Members[0].UserID != 12 {
		t.Fatalf("input = %#v", in)
	}
	for _, key := range []string{"expected_active_revision", "expected_active_hash", "revision", "items"} {
		params := approvalSettingsParamsForTest()
		delete(params, key)
		if _, ok := approvalSettingsRevisionInputFromParams(params); ok {
			t.Fatalf("missing %s must fail", key)
		}
	}
	params := approvalSettingsParamsForTest()
	params["unexpected"] = true
	if _, ok := approvalSettingsRevisionInputFromParams(params); ok {
		t.Fatal("unknown key must fail")
	}
}

func TestApprovalSettingsOrdinaryAdminCannotIncludeSelfOrOwnRole(t *testing.T) {
	admin := &biz.AdminUser{
		ID: 12,
		Roles: []biz.AdminRole{
			{Key: biz.AdminRoleKey},
			{Key: biz.SalesRoleKey},
		},
	}
	items := []biz.ApprovalSettingItemInput{
		{
			ApprovalKey: biz.ApprovalSettingSalesOrder,
			Enabled:     true,
			Members: []biz.ApprovalSettingMemberInput{
				{RoleKey: biz.PurchaseRoleKey, UserID: 12, Strategy: biz.ApprovalMemberStrategyPrimary, Enabled: true},
			},
		},
	}
	if !approvalSettingsWouldIncludeActor(items, admin) {
		t.Fatal("named self membership must be rejected")
	}
	items[0].Members[0] = biz.ApprovalSettingMemberInput{
		RoleKey: biz.SalesRoleKey, Strategy: biz.ApprovalMemberStrategyPrimary, Enabled: true,
	}
	if !approvalSettingsWouldIncludeActor(items, admin) {
		t.Fatal("own role membership must be rejected")
	}
	items[0].Members[0] = biz.ApprovalSettingMemberInput{
		RoleKey: biz.PurchaseRoleKey, Strategy: biz.ApprovalMemberStrategyPrimary, Enabled: true,
	}
	if approvalSettingsWouldIncludeActor(items, admin) {
		t.Fatal("unrelated responsibility must remain manageable")
	}
}

func TestApprovalSettingsActorMembershipIncludesFutureBackupAndEscalation(t *testing.T) {
	admin := &biz.AdminUser{
		ID: 12,
		Roles: []biz.AdminRole{
			{Key: biz.AdminRoleKey},
			{Key: biz.SalesRoleKey},
		},
	}
	settings := &biz.ApprovalSettingsExplanation{
		Items: []biz.ApprovalSettingItemExplanation{
			{
				ApprovalKey:  biz.ApprovalSettingSalesOrder,
				Configurable: true,
				Enabled:      true,
				Members: []biz.ApprovalSettingMemberExplanation{
					{
						RoleKey:  biz.BossRoleKey,
						Strategy: biz.ApprovalMemberStrategyPrimary,
						Priority: 100,
						Enabled:  true,
					},
					{
						RoleKey:  biz.SalesRoleKey,
						Strategy: biz.ApprovalMemberStrategyBackup,
						Priority: 200,
						Enabled:  true,
					},
				},
				EffectiveRoleKeys: []string{biz.BossRoleKey},
			},
			{
				ApprovalKey:  biz.ApprovalSettingShipmentFinance,
				Configurable: true,
				Enabled:      true,
				Members: []biz.ApprovalSettingMemberExplanation{
					{
						RoleKey:  biz.FinanceRoleKey,
						Strategy: biz.ApprovalMemberStrategyPrimary,
						Priority: 100,
						Enabled:  true,
					},
					{
						RoleKey:  biz.FinanceRoleKey,
						UserID:   admin.ID,
						Strategy: biz.ApprovalMemberStrategyEscalation,
						Priority: 300,
						Enabled:  true,
					},
				},
				EffectiveRoleKeys: []string{biz.FinanceRoleKey},
			},
		},
	}

	membership := approvalSettingsActorMembership(settings, admin)
	if !membership[biz.ApprovalSettingSalesOrder] {
		t.Fatal("own role in a future backup tier must count as actor membership")
	}
	if !membership[biz.ApprovalSettingShipmentFinance] {
		t.Fatal("named self in a future escalation tier must count as actor membership")
	}
}

func TestApprovalSettingsActorMembershipAllowsExistingResponsibilityComparison(t *testing.T) {
	admin := &biz.AdminUser{
		ID:    12,
		Roles: []biz.AdminRole{{Key: biz.SalesRoleKey}},
	}
	active := &biz.ApprovalSettingsExplanation{
		Items: []biz.ApprovalSettingItemExplanation{
			{
				ApprovalKey:  biz.ApprovalSettingSalesOrder,
				Configurable: true,
				Enabled:      true,
				Members: []biz.ApprovalSettingMemberExplanation{
					{
						RoleKey:  biz.SalesRoleKey,
						Strategy: biz.ApprovalMemberStrategyBackup,
						Enabled:  true,
					},
				},
			},
		},
	}
	candidate := *active
	candidate.Items = append([]biz.ApprovalSettingItemExplanation(nil), active.Items...)
	candidate.Items = append(candidate.Items, biz.ApprovalSettingItemExplanation{
		ApprovalKey:  biz.ApprovalSettingPurchaseOrder,
		Configurable: true,
		Enabled:      true,
		Members: []biz.ApprovalSettingMemberExplanation{
			{
				RoleKey:  biz.PurchaseRoleKey,
				Strategy: biz.ApprovalMemberStrategyPrimary,
				Enabled:  true,
			},
		},
	})

	activeMembership := approvalSettingsActorMembership(active, admin)
	candidateMembership := approvalSettingsActorMembership(&candidate, admin)
	if !activeMembership[biz.ApprovalSettingSalesOrder] || !candidateMembership[biz.ApprovalSettingSalesOrder] {
		t.Fatal("existing actor responsibility must remain comparable across unrelated edits")
	}
	if candidateMembership[biz.ApprovalSettingPurchaseOrder] {
		t.Fatal("unrelated responsibility must not count as actor membership")
	}
}

func TestApprovalSettingsExplanationSerializesRoleAndBlockerLists(t *testing.T) {
	settings := &biz.ApprovalSettingsExplanation{
		CustomerKey:    "yoyoosun",
		ConfigRevision: "approval-rev-1",
		ConfigHash:     "hash-1",
		ProductVersion: "v1",
		SchemaVersion:  "approval-settings/v1",
		Source:         "active",
		Items: []biz.ApprovalSettingItemExplanation{
			{
				ApprovalKey:       biz.ApprovalSettingSalesOrder,
				Label:             "销售订单审批",
				Domain:            "销售",
				PoolKey:           "approval.sales_order",
				Configurable:      true,
				Configured:        true,
				Enabled:           true,
				EffectiveRoleKeys: []string{biz.SalesRoleKey, biz.BossRoleKey},
				EffectiveStrategy: biz.ApprovalMemberStrategyPrimary,
				BlockedReasons:    []string{"缺少备用责任人"},
			},
		},
	}

	data := newDataStruct(map[string]any{
		"approval_settings": approvalSettingsExplanationToMap(settings),
	})
	if data == nil {
		t.Fatal("approval settings response must remain serializable")
	}
	raw := data.AsMap()
	approvalSettings, ok := raw["approval_settings"].(map[string]any)
	if !ok {
		t.Fatalf("approval_settings = %#v", raw["approval_settings"])
	}
	items, ok := approvalSettings["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("items = %#v", approvalSettings["items"])
	}
	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("item = %#v", items[0])
	}
	if configured, ok := item["configured"].(bool); !ok || !configured {
		t.Fatalf("configured = %#v", item["configured"])
	}
	roleKeys, ok := item["effective_role_keys"].([]any)
	if !ok || len(roleKeys) != 2 || roleKeys[0] != biz.SalesRoleKey || roleKeys[1] != biz.BossRoleKey {
		t.Fatalf("effective_role_keys = %#v", item["effective_role_keys"])
	}
	blockedReasons, ok := item["blocked_reasons"].([]any)
	if !ok || len(blockedReasons) != 1 || blockedReasons[0] != "缺少备用责任人" {
		t.Fatalf("blocked_reasons = %#v", item["blocked_reasons"])
	}
}

func TestApprovalSettingsMembersRequireEligibleRoleAndActiveEmployee(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	revokedAt := time.Now()
	repo.admins = map[int]*biz.AdminUser{
		1: {
			ID:           1,
			Username:     "root",
			IsSuperAdmin: true,
			Roles:        []biz.AdminRole{{Key: biz.AdminRoleKey}},
		},
		12: {
			ID:       12,
			Username: "multi-role-active",
			Roles: []biz.AdminRole{
				{Key: biz.SalesRoleKey},
				{Key: biz.FinanceRoleKey},
			},
		},
		13: {
			ID:       13,
			Username: "sales-suspended",
			Disabled: true,
			Roles:    []biz.AdminRole{{Key: biz.SalesRoleKey}},
		},
		14: {
			ID:        14,
			Username:  "sales-revoked",
			Disabled:  true,
			RevokedAt: &revokedAt,
			Roles:     []biz.AdminRole{{Key: biz.SalesRoleKey}},
		},
		15: {
			ID:       15,
			Username: "finance-only",
			Roles:    []biz.AdminRole{{Key: biz.FinanceRoleKey}},
		},
	}
	dispatcher := &jsonrpcDispatcher{
		adminManageUC: biz.NewAdminManageUsecase(
			repo,
			log.NewStdLogger(io.Discard),
			nil,
		),
	}
	tests := []struct {
		name        string
		membership  biz.WorkPoolMembershipInput
		wantMessage string
	}{
		{
			name: "active multi-role employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				UserID: 12, Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
		},
		{
			name: "suspended employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				UserID: 13, Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
			wantMessage: "指定员工当前未启用",
		},
		{
			name: "revoked employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				UserID: 14, Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
			wantMessage: "指定员工不存在或已离职",
		},
		{
			name: "employee missing selected role",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				UserID: 15, Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
			wantMessage: "指定员工不属于所选岗位",
		},
		{
			name: "missing employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				UserID: 99, Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
			wantMessage: "指定员工不存在或已离职",
		},
		{
			name: "role pool with active employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
				Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
		},
		{
			name: "role pool without active employee",
			membership: biz.WorkPoolMembershipInput{
				PoolKey: "approval.purchase_order", RoleKey: biz.PurchaseRoleKey,
				Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
			},
			wantMessage: "所选岗位当前没有可办理员工",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := dispatcher.validateApprovalSettingsMemberEligibility(
				customerConfigAdminCtx(1, biz.AdminRoleKey),
				[]biz.WorkPoolMembershipInput{test.membership},
			)
			if test.wantMessage == "" {
				if result != nil {
					t.Fatalf("unexpected validation result = %#v", result)
				}
				return
			}
			if result == nil || result.Message != test.wantMessage {
				t.Fatalf("validation result = %#v, want %q", result, test.wantMessage)
			}
		})
	}
}

func TestApprovalSettingsMembersRequirePersistedApprovalPermission(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	repo.rolePerms[biz.SalesRoleKey] = []string{biz.PermissionWorkflowTaskRead}
	repo.admins = map[int]*biz.AdminUser{
		1: {
			ID:           1,
			Username:     "root",
			IsSuperAdmin: true,
			Roles:        []biz.AdminRole{{Key: biz.AdminRoleKey}},
		},
		12: {
			ID:       12,
			Username: "sales-active",
			Roles:    []biz.AdminRole{{Key: biz.SalesRoleKey}},
		},
	}
	dispatcher := &jsonrpcDispatcher{
		adminManageUC: biz.NewAdminManageUsecase(
			repo,
			log.NewStdLogger(io.Discard),
			nil,
		),
	}

	result := dispatcher.validateApprovalSettingsMemberEligibility(
		customerConfigAdminCtx(1, biz.AdminRoleKey),
		[]biz.WorkPoolMembershipInput{{
			PoolKey: "approval.sales_order", RoleKey: biz.SalesRoleKey,
			Strategy: biz.ApprovalMemberStrategyPrimary, Priority: 100, Enabled: true,
		}},
	)
	if result == nil || result.Message != "所选岗位当前未开启审批功能" {
		t.Fatalf("validation result = %#v", result)
	}
}
