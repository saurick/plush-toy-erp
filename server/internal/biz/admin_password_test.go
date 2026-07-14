package biz

import "testing"

func TestValidateAdminPassword(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "minimum ASCII length", password: "12345678"},
		{name: "unicode within bcrypt byte limit", password: "毛绒玩具权限管理安全密码"},
		{name: "too short", password: "1234567", wantErr: true},
		{name: "bcrypt byte limit exceeded", password: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", wantErr: true},
		{name: "invalid UTF-8", password: string([]byte{0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8}), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAdminPassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateAdminPassword() error = %v, wantErr %t", err, tt.wantErr)
			}
		})
	}
}
