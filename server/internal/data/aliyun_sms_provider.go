package data

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/conf"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	dypnsapi "github.com/alibabacloud-go/dypnsapi-20170525/v3/client"
	util "github.com/alibabacloud-go/tea-utils/v2/service"
	"github.com/alibabacloud-go/tea/tea"
	"github.com/go-kratos/kratos/v2/log"
)

const (
	authSMSProviderAliyun      = "aliyun"
	defaultAliyunPNVSEndpoint  = "dypnsapi.aliyuncs.com"
	defaultAliyunCountryCode   = "86"
	defaultAliyunTemplateParam = `{"code":"##code##","min":"5"}`
	defaultAliyunCodeLength    = int64(6)
	defaultAliyunCodeType      = int64(1)
	defaultAliyunValidSeconds  = int64(300)
	defaultAliyunInterval      = int64(60)
)

type aliyunDypnsClient interface {
	SendSmsVerifyCodeWithOptions(*dypnsapi.SendSmsVerifyCodeRequest, *util.RuntimeOptions) (*dypnsapi.SendSmsVerifyCodeResponse, error)
	CheckSmsVerifyCodeWithOptions(*dypnsapi.CheckSmsVerifyCodeRequest, *util.RuntimeOptions) (*dypnsapi.CheckSmsVerifyCodeResponse, error)
}

type aliyunSMSConfig struct {
	AccessKeyID     string
	AccessKeySecret string
	Endpoint        string
	CountryCode     string
	SignName        string
	TemplateCode    string
	TemplateParam   string
	SchemeName      string
	CodeLength      int64
	CodeType        int64
	ValidSeconds    int64
	IntervalSeconds int64
}

type aliyunSMSLoginProvider struct {
	client aliyunDypnsClient
	config aliyunSMSConfig
}

func NewSMSLoginCodeProvider(c *conf.Data, logger log.Logger) (biz.SMSLoginCodeProvider, error) {
	mode := ""
	if c != nil && c.Auth != nil && c.Auth.Sms != nil {
		mode = strings.ToLower(strings.TrimSpace(c.Auth.Sms.Mode))
	}
	if mode != "provider" {
		return biz.NewLocalSMSLoginCodeProvider("admin"), nil
	}

	cfg, err := aliyunSMSConfigFromEnv(os.Getenv)
	if err != nil {
		return nil, err
	}
	client, err := newAliyunDypnsClient(cfg)
	if err != nil {
		return nil, err
	}
	log.NewHelper(log.With(logger, "module", "data.aliyun_sms")).Infof("auth sms provider initialized provider=%s endpoint=%s sign_name=%s template_code=%s", authSMSProviderAliyun, cfg.Endpoint, cfg.SignName, cfg.TemplateCode)
	return newAliyunSMSLoginProvider(client, cfg), nil
}

func newAliyunDypnsClient(cfg aliyunSMSConfig) (*dypnsapi.Client, error) {
	config := &openapi.Config{
		AccessKeyId:     tea.String(cfg.AccessKeyID),
		AccessKeySecret: tea.String(cfg.AccessKeySecret),
		Endpoint:        tea.String(cfg.Endpoint),
	}
	return dypnsapi.NewClient(config)
}

func newAliyunSMSLoginProvider(client aliyunDypnsClient, cfg aliyunSMSConfig) biz.SMSLoginCodeProvider {
	return &aliyunSMSLoginProvider{client: client, config: cfg}
}

func aliyunSMSConfigFromEnv(getenv func(string) string) (aliyunSMSConfig, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	cfg := aliyunSMSConfig{
		AccessKeyID:     strings.TrimSpace(getenv("APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID")),
		AccessKeySecret: strings.TrimSpace(getenv("APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET")),
		Endpoint:        firstNonEmptyString(getenv("APP_AUTH_SMS_ALIYUN_ENDPOINT"), defaultAliyunPNVSEndpoint),
		CountryCode:     firstNonEmptyString(getenv("APP_AUTH_SMS_ALIYUN_COUNTRY_CODE"), defaultAliyunCountryCode),
		SignName:        strings.TrimSpace(getenv("APP_AUTH_SMS_ALIYUN_SIGN_NAME")),
		TemplateCode:    strings.TrimSpace(getenv("APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE")),
		TemplateParam:   firstNonEmptyString(getenv("APP_AUTH_SMS_ALIYUN_TEMPLATE_PARAM"), defaultAliyunTemplateParam),
		SchemeName:      strings.TrimSpace(getenv("APP_AUTH_SMS_ALIYUN_SCHEME_NAME")),
		CodeLength:      defaultAliyunCodeLength,
		CodeType:        defaultAliyunCodeType,
		ValidSeconds:    defaultAliyunValidSeconds,
		IntervalSeconds: defaultAliyunInterval,
	}
	var err error
	if cfg.CodeLength, err = int64Env(getenv, "APP_AUTH_SMS_ALIYUN_CODE_LENGTH", cfg.CodeLength); err != nil {
		return aliyunSMSConfig{}, err
	}
	if cfg.ValidSeconds, err = int64Env(getenv, "APP_AUTH_SMS_ALIYUN_VALID_SECONDS", cfg.ValidSeconds); err != nil {
		return aliyunSMSConfig{}, err
	}
	if cfg.IntervalSeconds, err = int64Env(getenv, "APP_AUTH_SMS_ALIYUN_INTERVAL_SECONDS", cfg.IntervalSeconds); err != nil {
		return aliyunSMSConfig{}, err
	}

	missing := []string{}
	for key, value := range map[string]string{
		"APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID":     cfg.AccessKeyID,
		"APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET": cfg.AccessKeySecret,
		"APP_AUTH_SMS_ALIYUN_SIGN_NAME":         cfg.SignName,
		"APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE":     cfg.TemplateCode,
	} {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return aliyunSMSConfig{}, fmt.Errorf("aliyun sms provider config missing: %s", strings.Join(missing, ", "))
	}
	if cfg.CodeLength < 4 || cfg.CodeLength > 8 {
		return aliyunSMSConfig{}, fmt.Errorf("APP_AUTH_SMS_ALIYUN_CODE_LENGTH must be between 4 and 8")
	}
	if cfg.ValidSeconds <= 0 || cfg.IntervalSeconds <= 0 {
		return aliyunSMSConfig{}, fmt.Errorf("aliyun sms valid seconds and interval seconds must be positive")
	}
	return cfg, nil
}

func firstNonEmptyString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func int64Env(getenv func(string) string, key string, fallback int64) (int64, error) {
	value := strings.TrimSpace(getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return parsed, nil
}

func (p *aliyunSMSLoginProvider) Request(_ context.Context, phone string) (*biz.SMSLoginChallenge, error) {
	normalizedPhone, err := biz.NormalizeLoginPhone(phone)
	if err != nil {
		return nil, err
	}
	outID := fmt.Sprintf("plush-erp-admin-%d", time.Now().UnixNano())
	req := (&dypnsapi.SendSmsVerifyCodeRequest{}).
		SetPhoneNumber(normalizedPhone).
		SetCountryCode(p.config.CountryCode).
		SetSignName(p.config.SignName).
		SetTemplateCode(p.config.TemplateCode).
		SetTemplateParam(p.config.TemplateParam).
		SetCodeType(p.config.CodeType).
		SetCodeLength(p.config.CodeLength).
		SetValidTime(p.config.ValidSeconds).
		SetInterval(p.config.IntervalSeconds).
		SetDuplicatePolicy(1).
		SetReturnVerifyCode(false).
		SetOutId(outID)
	if p.config.SchemeName != "" {
		req.SetSchemeName(p.config.SchemeName)
	}
	resp, err := p.client.SendSmsVerifyCodeWithOptions(req, aliyunRuntimeOptions())
	if err != nil {
		if isAliyunSMSCooldown(err) {
			return nil, biz.ErrSMSCodeCooldown
		}
		if isAliyunSMSQuotaExceeded(err) {
			return nil, biz.ErrSMSServiceQuotaExceeded
		}
		return nil, fmt.Errorf("%w: aliyun sms send failed: %v", biz.ErrSMSServiceUnavailable, err)
	}
	if resp == nil || resp.Body == nil || !tea.BoolValue(resp.Body.Success) || !strings.EqualFold(tea.StringValue(resp.Body.Code), "OK") {
		code := ""
		message := ""
		if resp != nil && resp.Body != nil {
			code = tea.StringValue(resp.Body.Code)
			message = tea.StringValue(resp.Body.Message)
		}
		if isAliyunSMSCooldownCode(code, message) {
			return nil, biz.ErrSMSCodeCooldown
		}
		if isAliyunSMSQuotaExceededCode(code, message) {
			return nil, biz.ErrSMSServiceQuotaExceeded
		}
		return nil, fmt.Errorf("%w: aliyun sms send rejected: code=%s message=%s", biz.ErrSMSServiceUnavailable, code, message)
	}
	now := time.Now()
	return &biz.SMSLoginChallenge{
		Phone:        normalizedPhone,
		ExpiresAt:    now.Add(time.Duration(p.config.ValidSeconds) * time.Second),
		ResendAfter:  now.Add(time.Duration(p.config.IntervalSeconds) * time.Second),
		MockDelivery: false,
		MockCode:     "",
	}, nil
}

func (p *aliyunSMSLoginProvider) Verify(_ context.Context, phone, code string) (string, error) {
	normalizedPhone, err := biz.NormalizeLoginPhone(phone)
	if err != nil {
		return "", err
	}
	normalizedCode := strings.TrimSpace(code)
	if normalizedCode == "" {
		return "", biz.ErrSMSCodeInvalid
	}
	req := (&dypnsapi.CheckSmsVerifyCodeRequest{}).
		SetPhoneNumber(normalizedPhone).
		SetCountryCode(p.config.CountryCode).
		SetVerifyCode(normalizedCode).
		SetCaseAuthPolicy(1)
	if p.config.SchemeName != "" {
		req.SetSchemeName(p.config.SchemeName)
	}
	resp, err := p.client.CheckSmsVerifyCodeWithOptions(req, aliyunRuntimeOptions())
	if err != nil {
		return "", fmt.Errorf("%w: aliyun sms verify failed: %v", biz.ErrSMSServiceUnavailable, err)
	}
	if resp == nil || resp.Body == nil || !tea.BoolValue(resp.Body.Success) || !strings.EqualFold(tea.StringValue(resp.Body.Code), "OK") {
		code := ""
		message := ""
		if resp != nil && resp.Body != nil {
			code = tea.StringValue(resp.Body.Code)
			message = tea.StringValue(resp.Body.Message)
		}
		if isAliyunSMSCodeExpiredCode(code, message) {
			return "", biz.ErrSMSCodeExpired
		}
		if isAliyunSMSInvalidVerifyCode(code, message) {
			return "", biz.ErrSMSCodeInvalid
		}
		if isAliyunSMSQuotaExceededCode(code, message) {
			return "", biz.ErrSMSServiceQuotaExceeded
		}
		return "", fmt.Errorf("%w: aliyun sms verify rejected: code=%s message=%s", biz.ErrSMSServiceUnavailable, code, message)
	}
	if resp.Body.Model == nil || !strings.EqualFold(tea.StringValue(resp.Body.Model.VerifyResult), "PASS") {
		return "", biz.ErrSMSCodeInvalid
	}
	return normalizedPhone, nil
}

func aliyunRuntimeOptions() *util.RuntimeOptions {
	return (&util.RuntimeOptions{}).
		SetConnectTimeout(10000).
		SetReadTimeout(15000).
		SetAutoretry(false)
}

func isAliyunSMSCooldown(err error) bool {
	if err == nil {
		return false
	}
	return isAliyunSMSCooldownCode("", err.Error())
}

func isAliyunSMSQuotaExceeded(err error) bool {
	if err == nil {
		return false
	}
	return isAliyunSMSQuotaExceededCode("", err.Error())
}

func isAliyunSMSCooldownCode(code, message string) bool {
	text := strings.ToLower(code + " " + message)
	return strings.Contains(text, "business_limit") ||
		strings.Contains(text, "frequency") ||
		strings.Contains(text, "too frequent") ||
		strings.Contains(text, "频繁")
}

func isAliyunSMSQuotaExceededCode(code, message string) bool {
	text := strings.ToLower(code + " " + message)
	return strings.Contains(text, "quotanotenough") ||
		strings.Contains(text, "quota not enough") ||
		strings.Contains(text, "insufficient") ||
		strings.Contains(text, "余额不足") ||
		strings.Contains(text, "余量不足") ||
		strings.Contains(text, "额度不足") ||
		strings.Contains(text, "套餐余量") ||
		strings.Contains(text, "套餐已用完") ||
		strings.Contains(text, "欠费")
}

func isAliyunSMSCodeExpiredCode(code, message string) bool {
	text := strings.ToLower(code + " " + message)
	return strings.Contains(text, "expired") ||
		strings.Contains(text, "expire") ||
		strings.Contains(text, "过期") ||
		strings.Contains(text, "超时")
}

func isAliyunSMSInvalidVerifyCode(code, message string) bool {
	text := strings.ToLower(code + " " + message)
	return strings.Contains(text, "verifycode") ||
		strings.Contains(text, "verify code") ||
		strings.Contains(text, "invalid") ||
		strings.Contains(text, "incorrect") ||
		strings.Contains(text, "not match") ||
		strings.Contains(text, "验证码") ||
		strings.Contains(text, "校验码") ||
		strings.Contains(text, "错误") ||
		strings.Contains(text, "不正确") ||
		strings.Contains(text, "不匹配")
}
