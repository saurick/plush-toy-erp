package biz

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestLocalSMSCooldownReplaysRegisteredChallenge(t *testing.T) {
	provider := NewLocalSMSLoginCodeProvider("admin").(*localSMSLoginCodeProvider)
	now := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	provider.manager.now = func() time.Time { return now }
	first, err := provider.Request(t.Context(), "13800138000")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(10 * time.Second)
	if _, err := provider.manager.Request("admin", first.Phone); !errors.Is(err, ErrSMSCodeCooldown) {
		t.Fatalf("strict manager cooldown changed: %v", err)
	}
	retry, err := provider.Request(t.Context(), first.Phone)
	if err != nil || *retry != *first {
		t.Fatalf("local replay replaced challenge: %v", err)
	}
	if _, err := provider.Verify(t.Context(), retry.Phone, retry.MockCode); err != nil {
		t.Fatalf("replayed mock code cannot log in: %v", err)
	}
	if _, err := provider.Verify(t.Context(), retry.Phone, retry.MockCode); !errors.Is(err, ErrSMSCodeNotFound) {
		t.Fatalf("mock code was not consumed: %v", err)
	}
}

func TestLocalSMSCooldownReplayDoesNotResetFailedAttempts(t *testing.T) {
	provider := NewLocalSMSLoginCodeProvider("admin").(*localSMSLoginCodeProvider)
	first, err := provider.Request(t.Context(), "13800138000")
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000000"
	if first.MockCode == wrong {
		wrong = "111111"
	}
	for index := 0; index < smsLoginCodeMaxAttempts; index++ {
		if retry, err := provider.Request(t.Context(), first.Phone); err != nil || *retry != *first {
			t.Fatalf("replay %d changed challenge: %v", index, err)
		}
		_, err := provider.Verify(t.Context(), first.Phone, wrong)
		want := ErrSMSCodeInvalid
		if index == smsLoginCodeMaxAttempts-1 {
			want = ErrSMSCodeAttemptsExceeded
		}
		if !errors.Is(err, want) {
			t.Fatalf("attempt %d: got %v want %v", index, err, want)
		}
	}
	if _, err := provider.Verify(t.Context(), first.Phone, first.MockCode); !errors.Is(err, ErrSMSCodeNotFound) {
		t.Fatalf("replay refreshed the failed-attempt budget: %v", err)
	}
}

func TestLocalSMSConcurrentRequestsShareOneChallenge(t *testing.T) {
	provider := NewLocalSMSLoginCodeProvider("admin")
	var wait sync.WaitGroup
	challenges := make(chan *SMSLoginChallenge, 12)
	for range 12 {
		wait.Go(func() {
			challenge, err := provider.Request(t.Context(), "13800138000")
			if err != nil {
				t.Error(err)
				return
			}
			challenges <- challenge
		})
	}
	wait.Wait()
	close(challenges)
	var first *SMSLoginChallenge
	for challenge := range challenges {
		if first == nil {
			first = challenge
		} else if *challenge != *first {
			t.Fatal("concurrent mock requests replaced each other's challenge")
		}
	}
	if first == nil {
		t.Fatal("no mock challenge issued")
	}
}
