package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	stdhttp "net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	"server/internal/errcode"
	jwtutil "server/pkg/jwt"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

const (
	maxTemplatePDFRequestBody           = 3 << 20 // 3MB
	maxTemplateHTMLSize                 = 2 << 20 // 2MB
	defaultTemplatePDFRenderConcurrency = 2
	templatePDFRenderTimeout            = 30 * time.Second
	templatePDFQueueWaitTimeout         = 15 * time.Second
	templatePDFAssetWaitMax             = 350 * time.Millisecond
	templatePDFAssetPollStep            = 25 * time.Millisecond
	templatePDFWarmupTimeout            = 15 * time.Second
	templatePDFWarmupWaitTimeout        = 15 * time.Second
	templatePDFViewportWidth            = 1440
	templatePDFViewportHeight           = 900
)

var (
	errTemplatePDFPayloadTooLarge = errors.New("请求体过大，请精简模板后重试")
	errTemplatePDFRenderBusy      = errors.New("当前 PDF 预览人数较多，请稍后重试")
)

var sharedTemplatePDFChromeManager = newTemplatePDFChromeManager(launchTemplatePDFChrome)
var sharedTemplatePDFRenderGate = newTemplatePDFRenderGate(resolveTemplatePDFRenderConcurrency(os.Getenv("ERP_PDF_RENDER_CONCURRENCY")))
var sharedTemplatePDFWarmupState = newTemplatePDFWarmupState()

const templatePDFReadyCheckJS = `(function () {
  var imagesReady = Array.from(document.images || []).every(function (img) {
    return !!img.complete;
  });
  var fontsReady = !document.fonts || document.fonts.status === 'loaded';
  return document.readyState === 'complete' && imagesReady && fontsReady;
})()`

const templatePDFWarmupHTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; font-family: "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .paper { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 12mm; }
      h1 { margin: 0 0 8mm; font-size: 18pt; text-align: center; }
      table { width: 100%; border-collapse: collapse; font-size: 10pt; }
      th, td { border: 1px solid #111827; padding: 4mm 3mm; text-align: center; }
    </style>
  </head>
  <body>
    <main class="paper">
      <h1>采购合同 / 委外加工合同预热</h1>
      <table>
        <thead>
          <tr>
            <th>物料名称</th>
            <th>规格型号</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>毛绒玩具面料</td>
            <td>中文字体预热</td>
            <td>1000</td>
            <td>1.23</td>
            <td>1230.00</td>
          </tr>
        </tbody>
      </table>
    </main>
  </body>
</html>`

type renderTemplatePDFRequest struct {
	Title       string `json:"title"`
	FileName    string `json:"file_name"`
	TemplateKey string `json:"template_key"`
	HTML        string `json:"html"`
	BaseURL     string `json:"base_url"`
}

type adminRequestVerifier struct {
	jwtSecrets [][]byte
}

type templatePDFRenderGate struct {
	slots chan struct{}
}

type templatePDFChromeLauncher func(ctx context.Context, chromeExecPath string) (*templatePDFChromeRuntime, string, error)

type templatePDFChromeManager struct {
	mu      sync.Mutex
	launch  templatePDFChromeLauncher
	runtime *templatePDFChromeRuntime
	wsURL   string
}

type templatePDFChromeRuntime struct {
	cmd         *exec.Cmd
	exited      chan struct{}
	userDataDir string
	waitErrMu   sync.Mutex
	waitErr     error
}

type templatePDFWarmupStatus string

const (
	templatePDFWarmupPending  templatePDFWarmupStatus = "pending"
	templatePDFWarmupRunning  templatePDFWarmupStatus = "running"
	templatePDFWarmupReady    templatePDFWarmupStatus = "ready"
	templatePDFWarmupFailed   templatePDFWarmupStatus = "failed"
	templatePDFWarmupDisabled templatePDFWarmupStatus = "disabled"
)

type templatePDFWarmupState struct {
	mu     sync.RWMutex
	status templatePDFWarmupStatus
	err    error
	done   chan struct{}
}

// CleanupTemplatePDFResources 在进程退出前显式回收共享 Chromium，避免调试端口和临时目录残留。
func CleanupTemplatePDFResources() {
	sharedTemplatePDFChromeManager.Close()
}

// StartTemplatePDFWarmupAsync 在服务启动后后台跑通一次 PDF 渲染；readyz 会在预热完成前保持未就绪。
func StartTemplatePDFWarmupAsync(logger log.Logger) {
	sharedTemplatePDFWarmupState.StartAsync(
		logger,
		resolveTemplatePDFWarmupEnabled(
			os.Getenv("ERP_PDF_WARMUP"),
			os.Getenv("ERP_PDF_WARMUP_ENABLED"),
		),
		warmupTemplatePDFResources,
	)
}

func newTemplatePDFWarmupState() *templatePDFWarmupState {
	return &templatePDFWarmupState{status: templatePDFWarmupPending}
}

func (s *templatePDFWarmupState) StartAsync(
	logger log.Logger,
	enabled bool,
	run func(ctx context.Context) error,
) {
	helper := log.NewHelper(log.With(logger, "logger.name", "server.template_pdf"))
	if !enabled {
		s.setDisabled()
		helper.Infow("msg", "template pdf warmup disabled")
		return
	}
	if run == nil {
		run = warmupTemplatePDFResources
	}
	if !s.beginRun() {
		return
	}

	helper.Infow(
		"msg", "template pdf warmup started",
		"timeout_ms", templatePDFWarmupTimeout.Milliseconds(),
		"render_concurrency", sharedTemplatePDFRenderGate.Limit(),
	)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), templatePDFWarmupTimeout)
		defer cancel()

		startedAt := time.Now()
		if err := run(ctx); err != nil {
			s.finishRun(templatePDFWarmupFailed, err)
			helper.Warnw(
				"msg", "template pdf warmup failed",
				"duration_ms", time.Since(startedAt).Milliseconds(),
				"err", err.Error(),
			)
			return
		}

		s.finishRun(templatePDFWarmupReady, nil)
		helper.Infow(
			"msg", "template pdf warmup success",
			"duration_ms", time.Since(startedAt).Milliseconds(),
		)
	}()
}

func (s *templatePDFWarmupState) beginRun() bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	switch s.status {
	case templatePDFWarmupRunning, templatePDFWarmupReady, templatePDFWarmupDisabled:
		return false
	default:
		s.status = templatePDFWarmupRunning
		s.err = nil
		s.done = make(chan struct{})
		return true
	}
}

func (s *templatePDFWarmupState) finishRun(status templatePDFWarmupStatus, err error) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.status != templatePDFWarmupRunning {
		return
	}
	s.status = status
	s.err = err
	if s.done != nil {
		close(s.done)
		s.done = nil
	}
}

func (s *templatePDFWarmupState) setDisabled() {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.status == templatePDFWarmupRunning && s.done != nil {
		close(s.done)
	}
	s.status = templatePDFWarmupDisabled
	s.err = nil
	s.done = nil
}

func (s *templatePDFWarmupState) TemplatePDFWarmupReady() (bool, string, error) {
	if s == nil {
		return true, "", nil
	}
	s.mu.RLock()
	status := s.status
	err := s.err
	s.mu.RUnlock()

	switch status {
	case templatePDFWarmupReady, templatePDFWarmupDisabled:
		return true, "", nil
	case templatePDFWarmupFailed:
		return false, "pdf warmup failed", err
	default:
		return false, "pdf warmup not ready", nil
	}
}

func (s *templatePDFWarmupState) WaitIfRunning(ctx context.Context) (time.Duration, error) {
	if s == nil {
		return 0, nil
	}

	s.mu.RLock()
	if s.status != templatePDFWarmupRunning || s.done == nil {
		s.mu.RUnlock()
		return 0, nil
	}
	done := s.done
	s.mu.RUnlock()

	startedAt := time.Now()
	select {
	case <-done:
		return time.Since(startedAt), nil
	case <-ctx.Done():
		return time.Since(startedAt), ctx.Err()
	}
}

func newAdminRequestVerifier(dc *conf.Data) *adminRequestVerifier {
	secrets := make([][]byte, 0, 1)
	seen := map[string]struct{}{}
	addSecret := func(raw string) {
		secret := strings.TrimSpace(raw)
		if secret == "" {
			return
		}
		if _, ok := seen[secret]; ok {
			return
		}
		seen[secret] = struct{}{}
		secrets = append(secrets, []byte(secret))
	}

	if dc != nil && dc.Auth != nil {
		addSecret(dc.Auth.JwtSecret)
	}

	return &adminRequestVerifier{jwtSecrets: secrets}
}

func (v *adminRequestVerifier) IsAdminRequest(r *stdhttp.Request) bool {
	if r == nil {
		return false
	}

	if claims, ok := biz.GetClaimsFromContext(r.Context()); ok && claims != nil {
		return claims.IsAdmin()
	}

	if v == nil || len(v.jwtSecrets) == 0 {
		return false
	}

	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return false
	}

	for _, secret := range v.jwtSecrets {
		claims, err := jwtutil.ParseToken(secret, token)
		if err != nil || claims == nil {
			continue
		}
		if biz.Role(claims.Role) == biz.RoleAdmin {
			return true
		}
	}
	return false
}

func newTemplatePDFRenderGate(limit int) *templatePDFRenderGate {
	if limit < 1 {
		limit = defaultTemplatePDFRenderConcurrency
	}
	return &templatePDFRenderGate{
		slots: make(chan struct{}, limit),
	}
}

func (g *templatePDFRenderGate) Limit() int {
	if g == nil || g.slots == nil {
		return defaultTemplatePDFRenderConcurrency
	}
	return cap(g.slots)
}

func (g *templatePDFRenderGate) Acquire(ctx context.Context) (release func(), wait time.Duration, err error) {
	if g == nil || g.slots == nil {
		return func() {}, 0, nil
	}

	start := time.Now()
	select {
	case g.slots <- struct{}{}:
		var once sync.Once
		return func() {
			once.Do(func() {
				<-g.slots
			})
		}, time.Since(start), nil
	case <-ctx.Done():
		return nil, time.Since(start), ctx.Err()
	}
}

func resolveTemplatePDFRenderConcurrency(raw string) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return defaultTemplatePDFRenderConcurrency
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 {
		return defaultTemplatePDFRenderConcurrency
	}
	return limit
}

func resolveTemplatePDFWarmupEnabled(rawMode string, rawEnabled string) bool {
	mode := strings.ToLower(strings.TrimSpace(rawMode))
	if mode != "" {
		switch mode {
		case "1", "true", "yes", "on", "enabled", "async", "background":
			return true
		case "0", "false", "no", "off", "disabled", "none":
			return false
		default:
			return false
		}
	}

	switch strings.ToLower(strings.TrimSpace(rawEnabled)) {
	case "", "1", "true", "yes", "on", "enabled":
		return true
	case "0", "false", "no", "off", "disabled", "none":
		return false
	default:
		return true
	}
}

func warmupTemplatePDFResources(ctx context.Context) error {
	releaseRenderSlot, _, err := sharedTemplatePDFRenderGate.Acquire(ctx)
	if err != nil {
		return err
	}
	defer releaseRenderSlot()

	_, err = renderTemplateHTMLToPDF(ctx, templatePDFWarmupHTML, "", 1)
	return err
}

func registerTemplatePDFHandler(
	srv *httpx.Server,
	logger log.Logger,
	tp *sdktrace.TracerProvider,
	dc *conf.Data,
) {
	helper := log.NewHelper(log.With(logger, "logger.name", "server.template_pdf"))
	adminVerifier := newAdminRequestVerifier(dc)

	srv.Handle("/templates/render-pdf", newObservedHTTPHandler(logger, tp, "server.http.template_pdf.render", func(ctx context.Context, w stdhttp.ResponseWriter, r *stdhttp.Request) {
		l := helper.WithContext(ctx)
		requestID := requestIDFromRequest(r)
		traceID := traceIDFromContext(ctx)
		span := oteltrace.SpanFromContext(ctx)

		if !adminVerifier.IsAdminRequest(r) {
			span.SetStatus(codes.Error, "admin required")
			l.Warnw(
				"msg", "template pdf render denied",
				"path", r.URL.Path,
				"method", r.Method,
				"request_id", requestID,
				"trace_id", traceID,
				"reason", "admin required",
			)
			writeJSON(w, stdhttp.StatusUnauthorized, map[string]any{
				"code":    errcode.HTTPUnauthorized.Code,
				"message": errcode.HTTPUnauthorized.Message,
			})
			return
		}

		if r.Method != stdhttp.MethodPost {
			span.SetStatus(codes.Error, "method not allowed")
			l.Warnw(
				"msg", "template pdf render method not allowed",
				"path", r.URL.Path,
				"method", r.Method,
				"request_id", requestID,
				"trace_id", traceID,
			)
			writeJSON(w, stdhttp.StatusMethodNotAllowed, map[string]any{
				"code":    errcode.MethodNotAllowed.Code,
				"message": errcode.MethodNotAllowed.Message,
			})
			return
		}

		req, err := parseRenderTemplatePDFRequest(r)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			statusCode := stdhttp.StatusBadRequest
			errCode := errcode.TemplateRenderInvalid.Code
			if errors.Is(err, errTemplatePDFPayloadTooLarge) {
				statusCode = stdhttp.StatusRequestEntityTooLarge
				errCode = errcode.PayloadTooLarge.Code
			}
			l.Warnw(
				"msg", "template pdf render request invalid",
				"path", r.URL.Path,
				"method", r.Method,
				"status_code", statusCode,
				"request_id", requestID,
				"trace_id", traceID,
				"err", err.Error(),
			)
			writeJSON(w, statusCode, map[string]any{
				"code":    errCode,
				"message": err.Error(),
			})
			return
		}

		span.SetAttributes(
			attribute.String("template_pdf.template_key", req.TemplateKey),
			attribute.Int("template_pdf.html_size", len(req.HTML)),
			attribute.Int("template_pdf.render_concurrency", sharedTemplatePDFRenderGate.Limit()),
		)

		warmupWaitCtx, warmupWaitCancel := context.WithTimeout(ctx, templatePDFWarmupWaitTimeout)
		warmupWait, warmupWaitErr := sharedTemplatePDFWarmupState.WaitIfRunning(warmupWaitCtx)
		warmupWaitCancel()
		if warmupWait > 0 {
			span.SetAttributes(attribute.Int64("template_pdf.warmup_wait_ms", warmupWait.Milliseconds()))
		}
		if warmupWaitErr != nil {
			l.Warnw(
				"msg", "template pdf warmup wait skipped",
				"request_id", requestID,
				"trace_id", traceID,
				"template_key", req.TemplateKey,
				"warmup_wait_ms", warmupWait.Milliseconds(),
				"err", warmupWaitErr.Error(),
			)
		}

		queueCtx, queueCancel := context.WithTimeout(ctx, templatePDFQueueWaitTimeout)
		defer queueCancel()
		releaseRenderSlot, queueWait, err := sharedTemplatePDFRenderGate.Acquire(queueCtx)
		if err != nil {
			span.RecordError(err)
			span.SetAttributes(attribute.Int64("template_pdf.queue_wait_ms", queueWait.Milliseconds()))
			span.SetStatus(codes.Error, "render queue busy")
			l.Warnw(
				"msg", "template pdf render queue busy",
				"request_id", requestID,
				"trace_id", traceID,
				"template_key", req.TemplateKey,
				"queue_wait_ms", queueWait.Milliseconds(),
				"render_concurrency", sharedTemplatePDFRenderGate.Limit(),
				"err", err.Error(),
			)
			writeJSON(w, stdhttp.StatusTooManyRequests, map[string]any{
				"code":    errcode.TemplateRenderBusy.Code,
				"message": errTemplatePDFRenderBusy.Error(),
			})
			return
		}
		defer releaseRenderSlot()

		renderCtx, cancel := context.WithTimeout(ctx, templatePDFRenderTimeout)
		defer cancel()

		pdfBytes, err := renderTemplateHTMLToPDF(
			renderCtx,
			req.HTML,
			req.BaseURL,
			resolveTemplatePDFScale(req.TemplateKey),
		)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, "render pdf failed")
			l.Errorw(
				"msg", "服务器生成模板 PDF 失败",
				"request_id", requestID,
				"trace_id", traceID,
				"template_key", req.TemplateKey,
				"queue_wait_ms", queueWait.Milliseconds(),
				"html_size", len(req.HTML),
				"err", err.Error(),
			)
			writeJSON(w, stdhttp.StatusInternalServerError, map[string]any{
				"code":    errcode.TemplateRenderFailed.Code,
				"message": errcode.TemplateRenderFailed.Message,
			})
			return
		}

		filename := buildRenderPDFFilename(req.FileName, req.Title)
		span.SetAttributes(
			attribute.Int64("template_pdf.queue_wait_ms", queueWait.Milliseconds()),
			attribute.Int("template_pdf.bytes", len(pdfBytes)),
		)
		span.SetStatus(codes.Ok, "OK")

		l.Infow(
			"msg", "template pdf render success",
			"request_id", requestID,
			"trace_id", traceID,
			"template_key", req.TemplateKey,
			"queue_wait_ms", queueWait.Milliseconds(),
			"html_size", len(req.HTML),
			"pdf_bytes", len(pdfBytes),
			"filename", filename,
		)
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(stdhttp.StatusOK)
		_, _ = w.Write(pdfBytes)
	}))
}

func parseRenderTemplatePDFRequest(r *stdhttp.Request) (*renderTemplatePDFRequest, error) {
	defer func() {
		_ = r.Body.Close()
	}()

	body, err := io.ReadAll(io.LimitReader(r.Body, maxTemplatePDFRequestBody+1))
	if err != nil {
		return nil, errors.New("读取请求体失败")
	}
	if len(body) == 0 {
		return nil, errors.New("请求体为空")
	}
	if len(body) > maxTemplatePDFRequestBody {
		return nil, errTemplatePDFPayloadTooLarge
	}

	var req renderTemplatePDFRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return nil, errors.New("请求 JSON 非法")
	}

	req.HTML = strings.TrimSpace(req.HTML)
	if req.HTML == "" {
		return nil, errors.New("html 不能为空")
	}
	if len(req.HTML) > maxTemplateHTMLSize {
		return nil, errors.New("html 内容过大，请精简模板后重试")
	}

	baseURL, err := normalizeTemplatePDFBaseURL(req.BaseURL)
	if err != nil {
		return nil, err
	}
	req.BaseURL = baseURL
	req.Title = strings.TrimSpace(req.Title)
	req.FileName = strings.TrimSpace(req.FileName)
	req.TemplateKey = strings.TrimSpace(req.TemplateKey)

	return &req, nil
}

func normalizeTemplatePDFBaseURL(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", nil
	}

	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("base_url 非法")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("base_url 仅支持 http/https")
	}

	parsed.RawQuery = ""
	parsed.Fragment = ""
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	if !strings.HasSuffix(parsed.Path, "/") {
		parsed.Path += "/"
	}
	return parsed.String(), nil
}

func resolveTemplatePDFScale(templateKey string) float64 {
	return 1
}

func renderTemplateHTMLToPDF(ctx context.Context, htmlDoc string, baseURL string, printScale float64) ([]byte, error) {
	htmlDoc = injectTemplatePDFBaseTag(htmlDoc, baseURL)
	dataURL := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(htmlDoc))

	chromeExecPath, err := resolveTemplatePDFChromeExecPath(os.Getenv("ERP_PDF_CHROME_PATH"), exec.LookPath)
	if err != nil {
		return nil, err
	}

	_, wsURL, err := sharedTemplatePDFChromeManager.Acquire(ctx, chromeExecPath)
	if err != nil {
		return nil, err
	}

	allocCtx, cancelAllocator := chromedp.NewRemoteAllocator(ctx, wsURL)
	defer cancelAllocator()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	if printScale <= 0 {
		printScale = 1
	}

	var pdfBytes []byte
	if err := chromedp.Run(
		browserCtx,
		chromedp.ActionFunc(func(ctx context.Context) error {
			return emulation.SetDeviceMetricsOverride(
				templatePDFViewportWidth,
				templatePDFViewportHeight,
				1,
				false,
			).Do(ctx)
		}),
		chromedp.Navigate(dataURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.ActionFunc(func(ctx context.Context) error {
			return emulation.SetEmulatedMedia().WithMedia("print").Do(ctx)
		}),
		chromedp.ActionFunc(func(ctx context.Context) error {
			return waitTemplatePDFAssetsReady(ctx)
		}),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithLandscape(false).
				WithPaperWidth(8.27).
				WithPaperHeight(11.69).
				WithScale(printScale).
				WithPrintBackground(true).
				WithPreferCSSPageSize(false).
				WithMarginTop(0).
				WithMarginBottom(0).
				WithMarginLeft(0).
				WithMarginRight(0).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBytes = buf
			return nil
		}),
	); err != nil {
		return nil, err
	}
	if len(pdfBytes) == 0 {
		return nil, errors.New("生成结果为空")
	}
	return pdfBytes, nil
}

func newTemplatePDFChromeManager(launch templatePDFChromeLauncher) *templatePDFChromeManager {
	if launch == nil {
		launch = launchTemplatePDFChrome
	}
	return &templatePDFChromeManager{launch: launch}
}

func (m *templatePDFChromeManager) Close() {
	if m == nil {
		return
	}

	m.mu.Lock()
	runtime := m.runtime
	m.runtime = nil
	m.wsURL = ""
	m.mu.Unlock()

	if runtime != nil {
		runtime.Close()
	}
}

func (m *templatePDFChromeManager) Acquire(ctx context.Context, chromeExecPath string) (*templatePDFChromeRuntime, string, error) {
	if m == nil {
		return launchTemplatePDFChrome(ctx, chromeExecPath)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.runtime != nil && !m.runtime.Exited() && strings.TrimSpace(m.wsURL) != "" {
		return m.runtime, m.wsURL, nil
	}
	if m.runtime != nil {
		m.runtime.Close()
		m.runtime = nil
		m.wsURL = ""
	}

	runtime, wsURL, err := m.launch(ctx, chromeExecPath)
	if err != nil {
		return nil, "", err
	}
	m.runtime = runtime
	m.wsURL = wsURL
	return runtime, wsURL, nil
}

func launchTemplatePDFChrome(ctx context.Context, chromeExecPath string) (*templatePDFChromeRuntime, string, error) {
	debugPort, err := reserveTemplatePDFChromePort()
	if err != nil {
		return nil, "", fmt.Errorf("分配 Chrome 调试端口失败: %w", err)
	}

	userDataDir, err := os.MkdirTemp("", "template-pdf-chrome-*")
	if err != nil {
		return nil, "", fmt.Errorf("创建 Chrome 临时目录失败: %w", err)
	}

	args := []string{
		"--headless",
		"--disable-gpu",
		"--hide-scrollbars",
		"--mute-audio",
		"--disable-dev-shm-usage",
		"--no-sandbox",
		"--remote-debugging-address=127.0.0.1",
		fmt.Sprintf("--remote-debugging-port=%d", debugPort),
		fmt.Sprintf("--user-data-dir=%s", userDataDir),
		"about:blank",
	}

	cmd := exec.Command(chromeExecPath, args...)
	cmd.Stdout = io.Discard
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(userDataDir)
		return nil, "", fmt.Errorf("启动 Chrome 进程失败: %w", err)
	}

	runtime := &templatePDFChromeRuntime{
		cmd:         cmd,
		exited:      make(chan struct{}),
		userDataDir: userDataDir,
	}
	go func() {
		runtime.setWaitErr(cmd.Wait())
		close(runtime.exited)
	}()

	wsURL, err := waitTemplatePDFChromeWSURL(ctx, debugPort, runtime.exited, runtime, &stderr)
	if err != nil {
		runtime.Close()
		return nil, "", err
	}
	return runtime, wsURL, nil
}

func (r *templatePDFChromeRuntime) Close() {
	if r == nil {
		return
	}
	if r.cmd != nil && r.cmd.Process != nil && !r.Exited() {
		_ = r.cmd.Process.Kill()
	}
	if r.exited != nil {
		select {
		case <-r.exited:
		case <-time.After(2 * time.Second):
		}
	}
	if r.userDataDir != "" {
		_ = os.RemoveAll(r.userDataDir)
	}
}

func (r *templatePDFChromeRuntime) setWaitErr(err error) {
	if r == nil {
		return
	}
	r.waitErrMu.Lock()
	r.waitErr = err
	r.waitErrMu.Unlock()
}

func (r *templatePDFChromeRuntime) WaitErr() error {
	if r == nil {
		return nil
	}
	r.waitErrMu.Lock()
	defer r.waitErrMu.Unlock()
	return r.waitErr
}

func (r *templatePDFChromeRuntime) Exited() bool {
	if r == nil || r.exited == nil {
		return true
	}
	select {
	case <-r.exited:
		return true
	default:
		return false
	}
}

func reserveTemplatePDFChromePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer func() {
		_ = ln.Close()
	}()
	tcpAddr, ok := ln.Addr().(*net.TCPAddr)
	if !ok || tcpAddr.Port <= 0 {
		return 0, errors.New("无效端口")
	}
	return tcpAddr.Port, nil
}

func waitTemplatePDFChromeWSURL(
	ctx context.Context,
	debugPort int,
	exited <-chan struct{},
	runtime *templatePDFChromeRuntime,
	stderr *bytes.Buffer,
) (string, error) {
	client := &stdhttp.Client{Timeout: 800 * time.Millisecond}
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/json/version", debugPort)
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()

	for {
		wsURL, err := fetchTemplatePDFChromeWebSocketURL(client, endpoint)
		if err == nil {
			return wsURL, nil
		}

		select {
		case <-exited:
			detail := strings.TrimSpace(stderr.String())
			if detail == "" {
				detail = "无 stderr 输出"
			}
			waitErr := runtime.WaitErr()
			if waitErr != nil {
				return "", fmt.Errorf("chrome failed to start: %v; stderr=%s", waitErr, detail)
			}
			return "", fmt.Errorf("chrome failed to start: 进程提前退出; stderr=%s", detail)
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
		}
	}
}

func fetchTemplatePDFChromeWebSocketURL(client *stdhttp.Client, endpoint string) (string, error) {
	if client == nil {
		return "", errors.New("http client 为空")
	}

	resp, err := client.Get(endpoint)
	if err != nil {
		return "", err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != stdhttp.StatusOK {
		return "", fmt.Errorf("调试接口状态异常: %d", resp.StatusCode)
	}

	var payload struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	wsURL := strings.TrimSpace(payload.WebSocketDebuggerURL)
	if wsURL == "" {
		return "", errors.New("调试接口未返回 websocket 地址")
	}
	return wsURL, nil
}

func waitTemplatePDFAssetsReady(ctx context.Context) error {
	return waitTemplatePDFCondition(
		ctx,
		templatePDFAssetWaitMax,
		templatePDFAssetPollStep,
		func(checkCtx context.Context) (bool, error) {
			var ready bool
			if err := chromedp.Evaluate(templatePDFReadyCheckJS, &ready).Do(checkCtx); err != nil {
				return false, err
			}
			return ready, nil
		},
	)
}

func waitTemplatePDFCondition(
	ctx context.Context,
	maxWait time.Duration,
	pollStep time.Duration,
	check func(context.Context) (bool, error),
) error {
	if check == nil || maxWait <= 0 {
		return nil
	}
	if pollStep <= 0 {
		pollStep = templatePDFAssetPollStep
	}

	deadline := time.Now().Add(maxWait)
	for {
		ready, err := check(ctx)
		if err != nil {
			return err
		}
		if ready {
			return nil
		}

		remaining := time.Until(deadline)
		if remaining <= 0 {
			return nil
		}
		waitStep := pollStep
		if remaining < waitStep {
			waitStep = remaining
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(waitStep):
		}
	}
}

func resolveTemplatePDFChromeExecPath(rawEnv string, lookPath func(file string) (string, error)) (string, error) {
	if lookPath == nil {
		return "", errors.New("浏览器路径解析器未初始化")
	}

	if customPath := strings.TrimSpace(rawEnv); customPath != "" {
		resolved, err := lookPath(customPath)
		if err != nil {
			return "", fmt.Errorf("ERP_PDF_CHROME_PATH 无效: %w", err)
		}
		return resolved, nil
	}

	for _, candidate := range templatePDFChromeExecCandidates(runtime.GOOS) {
		resolved, err := lookPath(candidate)
		if err == nil && strings.TrimSpace(resolved) != "" {
			return resolved, nil
		}
	}

	// 本地开发兜底：复用 Playwright 已下载的 Linux Chromium，避免要求每台机器额外配置 ERP_PDF_CHROME_PATH。
	if resolved, err := resolveTemplatePDFPlaywrightChromeExecPath(); err == nil {
		return resolved, nil
	}

	return "", errors.New("未找到 Chrome/Chromium 可执行文件，请安装 Google Chrome/Chromium 或设置 ERP_PDF_CHROME_PATH")
}

func templatePDFChromeExecCandidates(goos string) []string {
	baseCandidates := []string{
		"google-chrome",
		"google-chrome-stable",
		"chromium-browser",
		"chromium",
		"chrome",
	}

	switch strings.ToLower(strings.TrimSpace(goos)) {
	case "darwin":
		return append([]string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		}, baseCandidates...)
	case "windows":
		return append([]string{
			"chrome.exe",
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		}, baseCandidates...)
	default:
		return baseCandidates
	}
}

func resolveTemplatePDFPlaywrightChromeExecPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return "", errors.New("用户目录不可用")
	}

	pattern := filepath.Join(homeDir, ".cache", "ms-playwright", "chromium-*", "chrome-linux64", "chrome")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return "", err
	}
	for idx := len(matches) - 1; idx >= 0; idx-- {
		candidate := matches[idx]
		info, statErr := os.Stat(candidate)
		if statErr == nil && !info.IsDir() && info.Mode().Perm()&0111 != 0 {
			return candidate, nil
		}
	}
	return "", errors.New("未找到 Playwright Chromium")
}

func injectTemplatePDFBaseTag(htmlDoc string, baseURL string) string {
	if strings.TrimSpace(baseURL) == "" {
		return htmlDoc
	}

	lower := strings.ToLower(htmlDoc)
	if strings.Contains(lower, "<base ") {
		return htmlDoc
	}

	baseTag := `<base href="` + escapeHTMLAttr(baseURL) + `">`
	if headIdx := strings.Index(lower, "<head"); headIdx >= 0 {
		if end := strings.Index(lower[headIdx:], ">"); end >= 0 {
			insertPos := headIdx + end + 1
			return htmlDoc[:insertPos] + baseTag + htmlDoc[insertPos:]
		}
	}
	if htmlIdx := strings.Index(lower, "<html"); htmlIdx >= 0 {
		if end := strings.Index(lower[htmlIdx:], ">"); end >= 0 {
			insertPos := htmlIdx + end + 1
			return htmlDoc[:insertPos] + "<head>" + baseTag + "</head>" + htmlDoc[insertPos:]
		}
	}
	return "<!doctype html><html><head>" + baseTag + "</head><body>" + htmlDoc + "</body></html>"
}

func buildRenderPDFFilename(rawName string, title string) string {
	name := strings.TrimSpace(rawName)
	if strings.EqualFold(filepathExt(name), ".pdf") {
		name = strings.TrimSpace(name[:len(name)-4])
	}
	if name == "" {
		name = strings.TrimSpace(title)
	}

	name = sanitizeFilenameToken(name)
	if name == "" {
		name = "template_preview"
	}
	if len(name) > 64 {
		name = name[:64]
	}
	return name + ".pdf"
}

func sanitizeFilenameToken(raw string) string {
	var b strings.Builder
	b.Grow(len(raw))

	lastUnderscore := false
	for _, ch := range raw {
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9':
			b.WriteRune(ch)
			lastUnderscore = false
		case ch == '-' || ch == '_':
			b.WriteRune(ch)
			lastUnderscore = false
		case ch == ' ' || ch == '.':
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}

	return strings.Trim(b.String(), "_-")
}

func filepathExt(name string) string {
	trimmed := strings.TrimSpace(name)
	lastDot := strings.LastIndex(trimmed, ".")
	if lastDot < 0 {
		return ""
	}
	return trimmed[lastDot:]
}

func escapeHTMLAttr(raw string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		`"`, "&quot;",
		"<", "&lt;",
		">", "&gt;",
	)
	return replacer.Replace(raw)
}

func writeJSON(w stdhttp.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
