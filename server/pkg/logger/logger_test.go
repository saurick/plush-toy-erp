package logger

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJSONLoggerConcurrentRecordsStayIndependent(t *testing.T) {
	var output bytes.Buffer
	logger := NewStdColorLogger(&output, true, false)
	const total = 200
	var writers sync.WaitGroup
	failures := make(chan error, total)
	for i := 0; i < total; i++ {
		writers.Add(1)
		go func(id int) {
			defer writers.Done()
			if err := logger.Log(log.LevelInfo, "event", id, "msg", "concurrent record"); err != nil {
				failures <- err
			}
		}(i)
	}
	writers.Wait()
	close(failures)
	for err := range failures {
		t.Errorf("write log: %v", err)
	}
	lines := bytes.Split(bytes.TrimSuffix(output.Bytes(), []byte("\n")), []byte("\n"))
	if len(lines) != total {
		t.Fatalf("got %d lines for %d events", len(lines), total)
	}
	seen := make(map[int]bool)
	for _, line := range lines {
		var event struct {
			Event int    `json:"event"`
			Level string `json:"level"`
		}
		if err := json.Unmarshal(line, &event); err != nil {
			t.Fatalf("invalid JSON record: %v", err)
		}
		if seen[event.Event] || event.Level != "INFO" {
			t.Fatalf("duplicate or incorrect event: %+v", event)
		}
		seen[event.Event] = true
	}
}

type privateFieldsError struct{ Private string }

func (*privateFieldsError) Error() string { return "safe diagnostic cause" }

func TestJSONLoggerPreservesErrorTextWithoutInternalFields(t *testing.T) {
	var typedNil *privateFieldsError
	for _, tc := range []struct {
		name string
		err  error
		want any
	}{
		{"plain", errors.New("diagnostic cause"), "diagnostic cause"},
		{"wrapped", fmt.Errorf("operation: %w", errors.New("diagnostic cause")), "operation: diagnostic cause"},
		{"private fields", &privateFieldsError{Private: "private-field-must-not-appear"}, "safe diagnostic cause"},
		{"typed nil", typedNil, nil},
		{"credentials", errors.New("connect postgres://user:private-password@db/app?access_token=private-token&mode=read"), "connect postgres://[redacted]@db/app?access_token=[redacted]&mode=read"},
		{"bearer", errors.New("upstream rejected Bearer private-token"), "upstream rejected Bearer [redacted]"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := NewStdColorLogger(&output, true, false)
			if err := logger.Log(log.LevelError, "err", tc.err); err != nil {
				t.Fatal(err)
			}
			var event map[string]any
			if err := json.Unmarshal(output.Bytes(), &event); err != nil {
				t.Fatal(err)
			}
			if event["err"] != tc.want || strings.Contains(output.String(), "must-not-appear") {
				t.Fatalf("unsafe or missing error text: %v", event["err"])
			}
		})
	}
}

type shortLogWriter struct{}

func (shortLogWriter) Write(p []byte) (int, error) { return len(p) - 1, nil }

func TestJSONLoggerReportsShortWrite(t *testing.T) {
	logger := NewStdColorLogger(shortLogWriter{}, true, false)
	if err := logger.Log(log.LevelInfo, "msg", "record"); !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("got %v, want short write", err)
	}
}
