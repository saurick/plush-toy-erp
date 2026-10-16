// Package attachmentstore owns the private object transport used by business attachments.
package attachmentstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	pkglogger "server/pkg/logger"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var (
	ErrUnavailable = errors.New("attachment object storage unavailable")
	ErrNotFound    = errors.New("attachment object missing")
	ErrIntegrity   = errors.New("attachment object integrity mismatch")
	keyPattern     = regexp.MustCompile(`^attachments/([a-f0-9]{32}|[a-f0-9]{64})$`)
	bucketPattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`)
)

// Store deliberately excludes deletion: withdrawal and database commit uncertainty
// must never destroy evidence. Unreferenced objects are handled during maintenance.
type Store interface {
	Put(context.Context, string, []byte) error
	Get(context.Context, string, int64) ([]byte, error)
}

type Config struct{ Endpoint, Bucket, Region, AccessKey, SecretKey string }

func ConfigFromEnv() Config {
	return Config{Endpoint: os.Getenv("ATTACHMENT_S3_ENDPOINT"), Bucket: os.Getenv("ATTACHMENT_S3_BUCKET"),
		Region: os.Getenv("ATTACHMENT_S3_REGION"), AccessKey: os.Getenv("ATTACHMENT_S3_ACCESS_KEY_ID"),
		SecretKey: os.Getenv("ATTACHMENT_S3_SECRET_ACCESS_KEY")}
}

func NewFromEnv(logger log.Logger) (Store, error) {
	cfg := ConfigFromEnv()
	store, err := New(cfg)
	if err != nil {
		return nil, err
	}
	store.log = log.NewHelper(log.With(logger, "logger.name", "attachmentstore.s3"))
	log.NewHelper(logger).Infow("msg", "attachment storage configured",
		"endpoint", strings.TrimRight(cfg.Endpoint, "/"), "bucket", cfg.Bucket,
		"region", store.client.Options().Region)
	return store, nil
}

type S3 struct {
	client *s3.Client
	bucket string
	log    *log.Helper
}

func New(c Config) (*S3, error) {
	u, err := url.Parse(c.Endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("ATTACHMENT_S3_ENDPOINT must be an absolute HTTP(S) origin")
	}
	if !bucketPattern.MatchString(c.Bucket) {
		return nil, errors.New("ATTACHMENT_S3_BUCKET must be a private environment-specific bucket name")
	}
	if strings.TrimSpace(c.AccessKey) == "" || strings.TrimSpace(c.SecretKey) == "" {
		return nil, errors.New("ATTACHMENT_S3_ACCESS_KEY_ID and ATTACHMENT_S3_SECRET_ACCESS_KEY are required")
	}
	if c.Region == "" {
		c.Region = "us-east-1"
	}
	client := s3.New(s3.Options{
		Region: c.Region, BaseEndpoint: aws.String(strings.TrimRight(c.Endpoint, "/")), UsePathStyle: true,
		Credentials:                credentials.NewStaticCredentialsProvider(c.AccessKey, c.SecretKey, ""),
		HTTPClient:                 &http.Client{Timeout: 20 * time.Second},
		Retryer:                    retry.NewStandard(func(o *retry.StandardOptions) { o.MaxAttempts = 2 }),
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &S3{client: client, bucket: c.Bucket}, nil
}

func NewKey() string           { return "attachments/" + strings.ReplaceAll(uuid.NewString(), "-", "") }
func ValidKey(key string) bool { return keyPattern.MatchString(key) }

// MigrationKey is deterministic for replay during a stopped-writer migration.
// Each environment has its own bucket, so database IDs cannot collide across environments.
func MigrationKey(id int64, digest string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", id, digest)))
	return "attachments/" + hex.EncodeToString(h[:])
}

// Only passive image formats are exposed for the storage console's preview.
// Other bytes stay downloads; sniffed HTML/SVG must not become active content.
func objectContentType(content []byte) string {
	switch kind := http.DetectContentType(content); kind {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		return kind
	default:
		return "application/octet-stream"
	}
}

func (s *S3) Put(ctx context.Context, key string, content []byte) (err error) {
	ctx, finish := startObjectTrace(ctx, "attachment.s3.put")
	start := time.Now()
	defer func() { finish(err); s.observeFailure(ctx, "put", start, err) }()
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if !ValidKey(key) || len(content) == 0 {
		return ErrIntegrity
	}
	sum := sha256.Sum256(content)
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key), Body: bytes.NewReader(content),
		ContentLength: aws.Int64(int64(len(content))), ContentType: aws.String(objectContentType(content)),
		ChecksumAlgorithm: types.ChecksumAlgorithmSha256, ChecksumSHA256: aws.String(base64.StdEncoding.EncodeToString(sum[:])),
		IfNoneMatch: aws.String("*"),
	})
	if err == nil {
		return nil
	}
	// A timed-out PUT or a conditional-write replay can already have persisted the
	// object. Prove the exact bytes before treating that outcome as success.
	stored, readErr := s.Get(ctx, key, int64(len(content)))
	if readErr == nil && bytes.Equal(stored, content) {
		return nil
	}
	return objectUnavailable(err)
}

func (s *S3) Get(ctx context.Context, key string, maximum int64) (_ []byte, err error) {
	ctx, finish := startObjectTrace(ctx, "attachment.s3.get")
	start := time.Now()
	defer func() { finish(err); s.observeFailure(ctx, "get", start, err) }()
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if !ValidKey(key) || maximum <= 0 {
		return nil, ErrIntegrity
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		var api smithy.APIError
		if errors.As(err, &api) && (api.ErrorCode() == "NoSuchKey" || api.ErrorCode() == "NotFound") {
			return nil, ErrNotFound
		}
		return nil, objectUnavailable(err)
	}
	defer func() { _ = out.Body.Close() }()
	if out.ContentLength != nil && *out.ContentLength > maximum {
		return nil, ErrIntegrity
	}
	content, err := io.ReadAll(io.LimitReader(out.Body, maximum+1))
	if err != nil {
		return nil, objectUnavailable(err)
	}
	if int64(len(content)) > maximum {
		return nil, ErrIntegrity
	}
	return content, nil
}

func startObjectTrace(ctx context.Context, operation string) (context.Context, func(error)) {
	ctx, span := otel.Tracer("attachmentstore.s3").Start(ctx, operation, trace.WithSpanKind(trace.SpanKindClient))
	span.SetAttributes(attribute.String("rpc.system", "aws-api"), attribute.String("rpc.service", "S3"))
	return ctx, func(err error) {
		if err != nil {
			span.SetStatus(codes.Error, "object storage operation failed")
		} else {
			span.SetStatus(codes.Ok, "")
		}
		span.End()
	}
}

func (s *S3) Check(ctx context.Context) (err error) {
	start := time.Now()
	defer func() { s.observeFailure(ctx, "check", start, err) }()
	_, err = s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	if err != nil {
		return objectUnavailable(err)
	}
	return nil
}

type objectUnavailableError struct{ reason string }

func (e *objectUnavailableError) Error() string { return ErrUnavailable.Error() + ": " + e.reason }
func (*objectUnavailableError) Unwrap() error   { return ErrUnavailable }

func objectUnavailable(err error) error {
	reason := "upstream_error"
	var networkError net.Error
	var api smithy.APIError
	switch {
	case errors.Is(err, context.Canceled):
		reason = "canceled"
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &networkError) && networkError.Timeout():
		reason = "timeout"
	case errors.As(err, &api):
		switch api.ErrorCode() {
		case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch":
			reason = "access_denied"
		case "NoSuchBucket":
			reason = "bucket_missing"
		case "SlowDown", "Throttling":
			reason = "throttled"
		case "RequestTimeout":
			reason = "timeout"
		}
	case errors.As(err, &networkError):
		reason = "network_error"
	}
	return &objectUnavailableError{reason: reason}
}

func (s *S3) observeFailure(ctx context.Context, operation string, start time.Time, err error) {
	var unavailable *objectUnavailableError
	if s.log == nil || !errors.As(err, &unavailable) {
		return
	}
	// The RPC completion owns the request result. Dependency diagnostics have
	// their own signal so one failed request is not counted for every layer.
	s.log.WithContext(ctx).Warnw("msg", "attachment dependency failed",
		"dependency", "attachment_s3", "operation", operation,
		"dependency_outcome", "error", "reason", unavailable.reason,
		"latency", time.Since(start).Seconds(),
		"request_id", pkglogger.RequestIDFromContext(ctx))
}
