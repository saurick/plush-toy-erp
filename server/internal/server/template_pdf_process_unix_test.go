//go:build unix

package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/chromedp/chromedp"
)

type templatePDFProcessReport struct {
	PID     int    `json:"pid"`
	Profile string `json:"profile"`
	WSURL   string `json:"ws_url"`
}

// Subprocess helpers exercise OS pipe ownership and process groups without a database.
func TestTemplatePDFChromeProcessHelper(t *testing.T) {
	mode := os.Getenv("ERP_PDF_PROCESS_TEST_MODE")
	if mode == "" {
		return
	}
	if mode == "worker" {
		select {}
	}
	if mode == "parent" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		r, wsURL, err := launchTemplatePDFChrome(ctx, os.Getenv("ERP_PDF_CHROME_PATH"))
		if err != nil {
			t.Fatal(err)
		}
		report, _ := json.Marshal(templatePDFProcessReport{r.cmd.Process.Pid, r.userDataDir, wsURL})
		if err := os.WriteFile(os.Getenv("ERP_PDF_PROCESS_TEST_REPORT"), report, 0600); err != nil {
			t.Fatal(err)
		}
		select {}
	}
	var profile string
	var port int
	for _, arg := range os.Args {
		if strings.HasPrefix(arg, "--user-data-dir=") {
			profile = strings.TrimPrefix(arg, "--user-data-dir=")
		}
		if strings.HasPrefix(arg, "--remote-debugging-port=") {
			port, _ = strconv.Atoi(strings.TrimPrefix(arg, "--remote-debugging-port="))
		}
	}
	worker := exec.Command(os.Args[0], "-test.run=^TestTemplatePDFChromeProcessHelper$")
	worker.Env = append(os.Environ(), "ERP_PDF_PROCESS_TEST_MODE=worker")
	if err := worker.Start(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profile, "worker.pid"), []byte(strconv.Itoa(worker.Process.Pid)), 0600); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		_ = http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = fmt.Fprintf(w, `{"webSocketDebuggerUrl":"ws://127.0.0.1:%d/devtools/browser/test"}`, port)
		}))
	}()
	if mode == "stubborn" {
		select {}
	}
	_, _ = io.Copy(io.Discard, os.NewFile(3, "devtools-input"))
	os.Exit(0)
}

func TestTemplatePDFChromeCloseReapsOwnedProcessGroup(t *testing.T) {
	for _, mode := range []string{"browser", "stubborn"} {
		t.Run(mode, func(t *testing.T) {
			executable, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			wrapper := filepath.Join(t.TempDir(), "chrome")
			quoted := "'" + strings.ReplaceAll(executable, "'", "'\\''") + "'"
			script := "#!/bin/sh\nERP_PDF_PROCESS_TEST_MODE=" + mode + " exec " + quoted + " -test.run=^TestTemplatePDFChromeProcessHelper$ -- \"$@\"\n"
			if err := os.WriteFile(wrapper, []byte(script), 0700); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			r, wsURL, err := launchTemplatePDFChrome(ctx, wrapper)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(r.Close)
			workerBytes, err := os.ReadFile(filepath.Join(r.userDataDir, "worker.pid"))
			if err != nil {
				t.Fatal(err)
			}
			workerPID, _ := strconv.Atoi(string(workerBytes))
			var closes sync.WaitGroup
			for range 4 {
				closes.Add(1)
				go func() { defer closes.Done(); r.Close() }()
			}
			closes.Wait()
			assertTemplatePDFProcessExited(t, r.cmd.Process.Pid)
			assertTemplatePDFProcessExited(t, workerPID)
			assertTemplatePDFProcessGroupExited(t, r.cmd.Process.Pid)
			if _, err := os.Stat(r.userDataDir); !os.IsNotExist(err) {
				t.Fatalf("owned profile remains: %v", err)
			}
			assertTemplatePDFDebugPortClosed(t, wsURL)
		})
	}
}

func TestTemplatePDFChromiumLifecycleIntegration(t *testing.T) {
	if os.Getenv("ERP_PDF_CHROMIUM_INTEGRATION") != "1" {
		t.Skip("set ERP_PDF_CHROMIUM_INTEGRATION=1 to run real Chromium lifecycle checks")
	}
	chromePath, err := resolveTemplatePDFChromeExecPath(os.Getenv("ERP_PDF_CHROME_PATH"), exec.LookPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("shutdown_during_cdp_work", func(t *testing.T) {
		manager := newTemplatePDFChromeManager(nil)
		t.Cleanup(manager.Shutdown)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		r, wsURL, err := manager.Acquire(ctx, chromePath)
		if err != nil {
			t.Fatal(err)
		}
		allocator, closeAllocator := chromedp.NewRemoteAllocator(ctx, wsURL)
		defer closeAllocator()
		browserCtx, closeBrowser := chromedp.NewContext(allocator)
		defer closeBrowser()
		working := make(chan struct{})
		finished := make(chan error, 1)
		go func() {
			finished <- chromedp.Run(browserCtx, chromedp.Navigate("about:blank"), chromedp.ActionFunc(func(ctx context.Context) error {
				close(working)
				<-ctx.Done()
				return ctx.Err()
			}))
		}()
		select {
		case <-working:
		case err := <-finished:
			t.Fatalf("CDP work did not start: %v", err)
		case <-ctx.Done():
			t.Fatal("CDP startup timeout")
		}
		manager.Shutdown()
		select {
		case <-finished:
		case <-time.After(5 * time.Second):
			t.Fatal("CDP work remained blocked after shutdown")
		}
		assertTemplatePDFProcessExited(t, r.cmd.Process.Pid)
		assertTemplatePDFProcessGroupExited(t, r.cmd.Process.Pid)
		assertTemplatePDFDebugPortClosed(t, wsURL)
		if _, err := os.Stat(r.userDataDir); !os.IsNotExist(err) {
			t.Fatalf("profile remains: %v", err)
		}
	})
	t.Run("parent_sigkill", func(t *testing.T) {
		reportPath := filepath.Join(t.TempDir(), "process.json")
		parent := exec.Command(os.Args[0], "-test.run=^TestTemplatePDFChromeProcessHelper$")
		parent.Env = append(os.Environ(), "ERP_PDF_PROCESS_TEST_MODE=parent", "ERP_PDF_CHROME_PATH="+chromePath, "ERP_PDF_PROCESS_TEST_REPORT="+reportPath)
		if err := parent.Start(); err != nil {
			t.Fatal(err)
		}
		var report templatePDFProcessReport
		t.Cleanup(func() {
			_ = parent.Process.Kill()
			if report.PID != 0 {
				_ = syscall.Kill(-report.PID, syscall.SIGKILL)
			}
			if report.Profile != "" {
				_ = os.RemoveAll(report.Profile)
			}
		})
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			data, readErr := os.ReadFile(reportPath)
			if readErr == nil && json.Unmarshal(data, &report) == nil {
				break
			}
			time.Sleep(25 * time.Millisecond)
		}
		if report.PID == 0 {
			t.Fatal("parent did not start Chromium")
		}
		if err := parent.Process.Kill(); err != nil {
			t.Fatal(err)
		}
		_ = parent.Wait()
		assertTemplatePDFProcessExited(t, report.PID)
		assertTemplatePDFProcessGroupExited(t, report.PID)
		assertTemplatePDFDebugPortClosed(t, report.WSURL)
	})
}

func templatePDFProcessAlive(pid int) bool {
	if err := syscall.Kill(pid, 0); err != nil {
		return false
	}
	status, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "stat=").Output()
	return err == nil && strings.TrimSpace(string(status)) != "" && !strings.HasPrefix(strings.TrimSpace(string(status)), "Z")
}

func assertTemplatePDFProcessExited(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for templatePDFProcessAlive(pid) && time.Now().Before(deadline) {
		time.Sleep(25 * time.Millisecond)
	}
	if templatePDFProcessAlive(pid) {
		t.Fatalf("owned process %d remains", pid)
	}
}

func assertTemplatePDFProcessGroupExited(t *testing.T, pgid int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		output, err := exec.Command("ps", "-axo", "pid=,pgid=,stat=").Output()
		if err != nil {
			t.Fatal(err)
		}
		var remaining []string
		for _, line := range strings.Split(string(output), "\n") {
			fields := strings.Fields(line)
			if len(fields) == 3 && fields[1] == strconv.Itoa(pgid) && !strings.HasPrefix(fields[2], "Z") {
				remaining = append(remaining, fields[0])
			}
		}
		if len(remaining) == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("owned process group %d has remaining processes: %v", pgid, remaining)
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func assertTemplatePDFDebugPortClosed(t *testing.T, wsURL string) {
	t.Helper()
	endpoint := strings.Replace(wsURL, "ws://", "http://", 1)
	client := http.Client{Timeout: time.Second}
	if response, err := client.Get(endpoint); err == nil {
		_ = response.Body.Close()
		t.Fatal("debug port remains reachable")
	}
}
