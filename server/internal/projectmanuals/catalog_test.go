package projectmanuals

import (
	"server/internal/biz"
	"testing"
)

func TestHelpCatalogCommonScenariosRequireActualRole(t *testing.T) {
	catalog := NewCatalog()
	var approvals biz.HelpDocument
	for _, document := range catalog.Documents() {
		if document.ID == "guide:approvals" {
			approvals = document
		}
	}
	if approvals.ID == "" {
		t.Fatal("approval guide missing")
	}
	sales := &biz.AdminUser{ID: 1, Roles: []biz.AdminRole{{Key: biz.SalesRoleKey}}, Permissions: []string{biz.PermissionWorkflowTaskRead}}
	if catalog.CanRead(sales, approvals) {
		t.Fatal("task-page permission must not expose another role's common guide")
	}
	boss := &biz.AdminUser{ID: 2, Roles: []biz.AdminRole{{Key: biz.BossRoleKey}}}
	if !catalog.CanRead(boss, approvals) {
		t.Fatal("actual responsible role cannot read its guide")
	}
	custom := &biz.AdminUser{ID: 3, Permissions: []string{biz.PermissionProductRead}}
	var productGuide biz.HelpDocument
	for _, document := range catalog.Documents() {
		if document.ID == "products" {
			productGuide = document
		}
	}
	if productGuide.ID == "" || !catalog.CanRead(custom, productGuide) {
		t.Fatal("actual page permission must retain that page's help")
	}
}
