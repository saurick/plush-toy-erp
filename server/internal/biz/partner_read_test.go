package biz

import (
	"context"
	"testing"
)

func TestPartnerBindingRequiresOneTypedOrganization(t *testing.T) {
	id, zero := 7, 0
	for _, test := range []struct {
		name    string
		binding PartnerBinding
		valid   bool
	}{
		{"employee", PartnerBinding{}, true},
		{"supplier", PartnerBinding{Kind: AccountKindSupplier, SupplierID: &id}, true},
		{"customer", PartnerBinding{Kind: AccountKindCustomer, CustomerID: &id}, true},
		{"missing", PartnerBinding{Kind: AccountKindSupplier}, false},
		{"zero", PartnerBinding{Kind: AccountKindCustomer, CustomerID: &zero}, false},
		{"both", PartnerBinding{Kind: AccountKindSupplier, SupplierID: &id, CustomerID: &id}, false},
		{"wrong", PartnerBinding{Kind: AccountKindCustomer, SupplierID: &id}, false},
		{"employee_scope", PartnerBinding{SupplierID: &id}, false},
		{"unknown", PartnerBinding{Kind: 9}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.binding.Valid() != test.valid {
				t.Fatal("binding validation mismatch")
			}
		})
	}
}

func TestCurrentPartnerRequiresVerifiedLiveBoundary(t *testing.T) {
	id := 7
	for _, name := range []string{"allowed", "claims_only", "employee", "disabled", "organization_disabled", "super_admin", "wrong_subject", "missing_binding"} {
		t.Run(name, func(t *testing.T) {
			account := &AdminUser{ID: 1, AccountKind: AccountKindSupplier, SupplierID: &id, PartnerActive: true}
			claims := &AuthClaims{UserID: 1, Role: RolePartner}
			switch name {
			case "employee":
				claims.Role = RoleAdmin
			case "disabled":
				account.Disabled = true
			case "organization_disabled":
				account.PartnerActive = false
			case "super_admin":
				account.IsSuperAdmin = true
			case "wrong_subject":
				claims.UserID = 2
			case "missing_binding":
				account.SupplierID = nil
			}
			ctx := NewContextWithClaims(context.Background(), claims)
			if name != "claims_only" {
				ctx = WithCurrentAdmin(ctx, account)
			}
			_, err := CurrentPartner(ctx)
			if (err == nil) != (name == "allowed") {
				t.Fatal("partner identity boundary mismatch")
			}
		})
	}
}

func TestSessionIdentityAloneDoesNotGrantEmployeeRole(t *testing.T) {
	for _, role := range []Role{RoleUser, RolePartner} {
		if (&AuthClaims{UserID: 1, SessionKey: "verified-session", AuthVersion: 1, Role: role}).IsAdmin() {
			t.Fatal("session granted employee role")
		}
	}
}
