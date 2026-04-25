package errcode

// Definition 统一描述一个对外错误码，保持“一码一义”，避免前后端语义漂移。
type Definition struct {
	Name    string
	Code    int32
	Message string
}

var (
	OK = Definition{Name: "OK", Code: 0, Message: "OK"}

	JSONRPCUnknownURL     = Definition{Name: "JSONRPCUnknownURL", Code: 40001, Message: "未知 RPC 域"}
	InvalidParam          = Definition{Name: "InvalidParam", Code: 40010, Message: "参数不合法"}
	AdminInvalidLevel     = Definition{Name: "AdminInvalidLevel", Code: 40011, Message: "管理员等级不合法"}
	UnknownMethod         = Definition{Name: "UnknownMethod", Code: 40020, Message: "未知接口"}
	UserInvalidParam      = Definition{Name: "UserInvalidParam", Code: 40030, Message: "参数不合法"}
	TemplateRenderInvalid = Definition{Name: "TemplateRenderInvalid", Code: 40053, Message: "模板渲染请求不合法"}

	UserSetDisabledInvalid = Definition{Name: "UserSetDisabledInvalid", Code: 40071, Message: "参数错误：user_id 无效"}

	HTTPUnauthorized = Definition{Name: "HTTPUnauthorized", Code: 40101, Message: "需要管理员权限"}
	AdminRequired    = Definition{Name: "AdminRequired", Code: 40301, Message: "需要管理员权限"}
	AuthRequired     = Definition{Name: "AuthRequired", Code: 40302, Message: "未登录"}
	AdminDisabled    = Definition{Name: "AdminDisabled", Code: 40303, Message: "管理员已禁用"}
	PermissionDenied = Definition{Name: "PermissionDenied", Code: 40304, Message: "权限不足"}
	AdminNotFound    = Definition{Name: "AdminNotFound", Code: 40410, Message: "管理员不存在"}

	MethodNotAllowed = Definition{Name: "MethodNotAllowed", Code: 40500, Message: "仅支持 POST"}

	PayloadTooLarge    = Definition{Name: "PayloadTooLarge", Code: 41300, Message: "请求体过大"}
	TemplateRenderBusy = Definition{Name: "TemplateRenderBusy", Code: 42953, Message: "当前 PDF 预览人数较多，请稍后重试"}

	AuthUserNotFound            = Definition{Name: "AuthUserNotFound", Code: 10001, Message: "用户不存在"}
	AuthInvalidPassword         = Definition{Name: "AuthInvalidPassword", Code: 10002, Message: "密码错误"}
	AuthUserDisabled            = Definition{Name: "AuthUserDisabled", Code: 10003, Message: "用户已被禁用"}
	AuthUserExists              = Definition{Name: "AuthUserExists", Code: 10004, Message: "用户名已存在"}
	AuthExpired                 = Definition{Name: "AuthExpired", Code: 10005, Message: "登录已过期，请重新登录"}
	AuthInvalid                 = Definition{Name: "AuthInvalid", Code: 10006, Message: "登录无效，请重新登录"}
	AuthInvalidPhone            = Definition{Name: "AuthInvalidPhone", Code: 10007, Message: "手机号格式不正确"}
	AuthInvalidSMSCode          = Definition{Name: "AuthInvalidSMSCode", Code: 10008, Message: "验证码错误"}
	AuthSMSCodeExpired          = Definition{Name: "AuthSMSCodeExpired", Code: 10009, Message: "验证码已过期，请重新获取"}
	AuthSMSCodeTooFrequent      = Definition{Name: "AuthSMSCodeTooFrequent", Code: 10010, Message: "验证码发送过于频繁，请稍后再试"}
	AuthSMSCodeAttemptsExceeded = Definition{Name: "AuthSMSCodeAttemptsExceeded", Code: 10011, Message: "验证码错误次数过多，请重新获取"}
	AuthPhoneNotBound           = Definition{Name: "AuthPhoneNotBound", Code: 10012, Message: "该手机号未开通登录权限，请联系管理员"}
	AuthMobileRoleDenied        = Definition{Name: "AuthMobileRoleDenied", Code: 10013, Message: "该账号暂无当前角色登录权限，请联系管理员"}
	AdminExists                 = Definition{Name: "AdminExists", Code: 40910, Message: "管理员账号已存在"}
	AdminPhoneExists            = Definition{Name: "AdminPhoneExists", Code: 40911, Message: "手机号已绑定其他管理员"}

	Internal              = Definition{Name: "Internal", Code: 50000, Message: "服务器内部错误"}
	AuthCurrentUserFailed = Definition{Name: "AuthCurrentUserFailed", Code: 50001, Message: "获取用户信息失败"}
	UserListFailed        = Definition{Name: "UserListFailed", Code: 50020, Message: "获取用户列表失败"}
	TemplateRenderFailed  = Definition{Name: "TemplateRenderFailed", Code: 50053, Message: "服务器生成 PDF 失败，请稍后重试"}
)

var definitions = []Definition{
	OK,
	JSONRPCUnknownURL,
	InvalidParam,
	AdminInvalidLevel,
	UnknownMethod,
	UserInvalidParam,
	TemplateRenderInvalid,
	UserSetDisabledInvalid,
	HTTPUnauthorized,
	AdminRequired,
	AuthRequired,
	AdminDisabled,
	PermissionDenied,
	AdminNotFound,
	MethodNotAllowed,
	PayloadTooLarge,
	TemplateRenderBusy,
	AuthUserNotFound,
	AuthInvalidPassword,
	AuthUserDisabled,
	AuthUserExists,
	AuthExpired,
	AuthInvalid,
	AuthInvalidPhone,
	AuthInvalidSMSCode,
	AuthSMSCodeExpired,
	AuthSMSCodeTooFrequent,
	AuthSMSCodeAttemptsExceeded,
	AuthPhoneNotBound,
	AuthMobileRoleDenied,
	AdminExists,
	AdminPhoneExists,
	Internal,
	AuthCurrentUserFailed,
	UserListFailed,
	TemplateRenderFailed,
}

func Definitions() []Definition {
	out := make([]Definition, len(definitions))
	copy(out, definitions)
	return out
}

// IsAuthFailureCode 仅识别“需要重新登录”的登录态错误，避免把权限不足误处理成登出。
func IsAuthFailureCode(code int32) bool {
	switch code {
	case AuthExpired.Code, AuthInvalid.Code, AuthRequired.Code:
		return true
	default:
		return false
	}
}
