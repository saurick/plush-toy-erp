package data

import (
	"errors"
	"testing"

	"server/internal/biz"
	"server/internal/conf"

	dypnsapi "github.com/alibabacloud-go/dypnsapi-20170525/v3/client"
	util "github.com/alibabacloud-go/tea-utils/v2/service"
	"github.com/alibabacloud-go/tea/tea"
	"github.com/go-kratos/kratos/v2/log"
)

type fakeAliyunDypnsClient struct {
	sendReq   *dypnsapi.SendSmsVerifyCodeRequest
	checkReq  *dypnsapi.CheckSmsVerifyCodeRequest
	sendResp  *dypnsapi.SendSmsVerifyCodeResponse
	checkResp *dypnsapi.CheckSmsVerifyCodeResponse
	sendErr   error
	checkErr  error
}

func (c *fakeAliyunDypnsClient) SendSmsVerifyCodeWithOptions(req *dypnsapi.SendSmsVerifyCodeRequest, _ *util.RuntimeOptions) (*dypnsapi.SendSmsVerifyCodeResponse, error) {
	c.sendReq = req
	return c.sendResp, c.sendErr
}

func (c *fakeAliyunDypnsClient) CheckSmsVerifyCodeWithOptions(req *dypnsapi.CheckSmsVerifyCodeRequest, _ *util.RuntimeOptions) (*dypnsapi.CheckSmsVerifyCodeResponse, error) {
	c.checkReq = req
	return c.checkResp, c.checkErr
}

func TestAliyunSMSConfigFromEnvRequiresProviderSecrets(t *testing.T) {
	_, err := aliyunSMSConfigFromEnv(func(key string) string {
		values := map[string]string{
			"APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID": "ak",
			"APP_AUTH_SMS_ALIYUN_SIGN_NAME":     "速通互联验证码",
		}
		return values[key]
	})
	if err == nil {
		t.Fatal("expected missing config to be rejected")
	}
}

func TestNewSMSLoginCodeProviderUsesLocalProviderUnlessProviderMode(t *testing.T) {
	got, err := NewSMSLoginCodeProvider(&conf.Data{
		Auth: &conf.Data_Auth{Sms: &conf.Data_Auth_SMS{Mode: "disabled"}},
	}, log.DefaultLogger)
	if err != nil {
		t.Fatalf("NewSMSLoginCodeProvider: %v", err)
	}
	if got == nil {
		t.Fatal("expected local provider")
	}
}

func TestAliyunSMSLoginProviderSendsWithConfiguredTemplate(t *testing.T) {
	client := &fakeAliyunDypnsClient{
		sendResp: &dypnsapi.SendSmsVerifyCodeResponse{Body: &dypnsapi.SendSmsVerifyCodeResponseBody{
			Success: tea.Bool(true),
			Code:    tea.String("OK"),
			Message: tea.String("OK"),
		}},
	}
	provider := newAliyunSMSLoginProvider(client, aliyunSMSConfig{
		CountryCode:     "86",
		SignName:        "速通互联验证码",
		TemplateCode:    "100001",
		TemplateParam:   `{"code":"##code##","min":"5"}`,
		CodeType:        1,
		CodeLength:      6,
		ValidSeconds:    300,
		IntervalSeconds: 60,
	})

	challenge, err := provider.Request(t.Context(), "+86 137-9456-6255")
	if err != nil {
		t.Fatalf("Request: %v", err)
	}
	if challenge.MockDelivery || challenge.MockCode != "" {
		t.Fatalf("provider mode must not expose mock code: %+v", challenge)
	}
	if got := tea.StringValue(client.sendReq.PhoneNumber); got != "13794566255" {
		t.Fatalf("PhoneNumber = %q", got)
	}
	if got := tea.StringValue(client.sendReq.SignName); got != "速通互联验证码" {
		t.Fatalf("SignName = %q", got)
	}
	if got := tea.StringValue(client.sendReq.TemplateCode); got != "100001" {
		t.Fatalf("TemplateCode = %q", got)
	}
	if got := tea.StringValue(client.sendReq.TemplateParam); got != `{"code":"##code##","min":"5"}` {
		t.Fatalf("TemplateParam = %q", got)
	}
	if got := tea.BoolValue(client.sendReq.ReturnVerifyCode); got {
		t.Fatal("ReturnVerifyCode must remain false")
	}
}

func TestAliyunSMSLoginProviderVerifyPass(t *testing.T) {
	client := &fakeAliyunDypnsClient{
		checkResp: &dypnsapi.CheckSmsVerifyCodeResponse{Body: &dypnsapi.CheckSmsVerifyCodeResponseBody{
			Success: tea.Bool(true),
			Code:    tea.String("OK"),
			Model: &dypnsapi.CheckSmsVerifyCodeResponseBodyModel{
				VerifyResult: tea.String("PASS"),
			},
		}},
	}
	provider := newAliyunSMSLoginProvider(client, aliyunSMSConfig{CountryCode: "86"})

	phone, err := provider.Verify(t.Context(), "13794566255", "123456")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if phone != "13794566255" {
		t.Fatalf("phone = %q", phone)
	}
	if got := tea.StringValue(client.checkReq.VerifyCode); got != "123456" {
		t.Fatalf("VerifyCode = %q", got)
	}
}

func TestAliyunSMSLoginProviderVerifyUnknownMapsToInvalidCode(t *testing.T) {
	client := &fakeAliyunDypnsClient{
		checkResp: &dypnsapi.CheckSmsVerifyCodeResponse{Body: &dypnsapi.CheckSmsVerifyCodeResponseBody{
			Success: tea.Bool(true),
			Code:    tea.String("OK"),
			Model: &dypnsapi.CheckSmsVerifyCodeResponseBodyModel{
				VerifyResult: tea.String("UNKNOWN"),
			},
		}},
	}
	provider := newAliyunSMSLoginProvider(client, aliyunSMSConfig{CountryCode: "86"})

	if _, err := provider.Verify(t.Context(), "13794566255", "000000"); !errors.Is(err, biz.ErrSMSCodeInvalid) {
		t.Fatalf("expected ErrSMSCodeInvalid, got %v", err)
	}
}
