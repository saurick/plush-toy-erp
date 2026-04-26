// server/internal/data/model/schema/admin_user.go
package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AdminUser struct {
	ent.Schema
}

func (AdminUser) Fields() []ent.Field {
	return []ent.Field{
		field.String("username").
			NotEmpty().
			MaxLen(64),
		field.String("phone").
			Optional().
			Nillable().
			MaxLen(32).
			Comment("管理员手机号，用于短信验证码登录"),
		field.String("password_hash").
			NotEmpty().
			Sensitive(),
		field.Bool("is_super_admin").
			Default(false).
			Comment("超级管理员拥有全部 RBAC 权限，但业务任务处理仍受归属规则约束"),
		field.String("erp_preferences").
			Default("{}").
			MaxLen(32768).
			Comment("管理员 ERP 页面偏好 JSON"),
		field.Bool("disabled").
			Default(false),
		field.Time("last_login_at").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (AdminUser) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("username").Unique(),
		index.Fields("phone").Unique(),
		index.Fields("is_super_admin"),
	}
}
