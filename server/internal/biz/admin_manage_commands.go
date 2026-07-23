package biz

// AdminCreateCommand keeps the control-plane mutation inputs together so the
// repository can create the account, assign roles, and write its audit event in
// one transaction using rows read inside that transaction.
type AdminCreateCommand struct {
	Admin      *AdminCreate
	OperatorID int
}

type AdminRolesChange struct {
	AdminID    int
	OperatorID int
	RoleKeys   []string
}

type RolePermissionsChange struct {
	RoleKey         string
	OperatorID      int
	ExpectedVersion int
	PermissionKeys  []string
}

type RoleNavigationChange struct {
	RoleKey          string
	OperatorID       int
	ExpectedVersion  int
	Mode             RoleNavigationMode
	PrimaryMenuPaths []string
}

type RoleDataScopesChangeCommand struct {
	RoleKey         string
	OperatorID      int
	ExpectedVersion int
	Scopes          []RoleDataScope
}

type AdminPhoneChange struct {
	AdminID    int
	OperatorID int
	Phone      string
}

type AdminPasswordReset struct {
	AdminID      int
	OperatorID   int
	PasswordHash string
}
