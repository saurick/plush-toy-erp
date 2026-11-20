#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/event.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/utsname.h>
#include <sys/wait.h>
#include <unistd.h>

#include "guard-config.h"

extern int memorystatus_control(uint32_t, pid_t, uint32_t, void *, size_t);
typedef struct {
  int32_t active;
  uint32_t active_attributes;
  int32_t inactive;
  uint32_t inactive_attributes;
} memory_limits;

static void fail(const char *reason) {
  fprintf(stderr, "[qa:node-kernel] status=incomplete reason=%s\n", reason);
  exit(75);
}

static long integer(const char *value) {
  if (!value || !*value) fail("invalid-guard-argument");
  char *end;
  errno = 0;
  long number = strtol(value, &end, 10);
  if (errno || *end || number < 0 || number > INT32_MAX) fail("invalid-guard-argument");
  return number;
}

static int process_memory_limit(int ceiling) {
  const char *requested = getenv("PLUSH_NODE_GUARD_MEMORY_MIB");
  if (!requested) return ceiling;
  if (!*requested) fail("invalid-memory-request");
  for (const char *digit = requested; *digit; digit++) {
    if (*digit < '0' || *digit > '9') fail("invalid-memory-request");
  }
  long limit = integer(requested);
  if (limit < GUARD_UNIT_MIB || limit > ceiling || limit % GUARD_UNIT_MIB) {
    fail("invalid-memory-request");
  }
  return (int)limit;
}

static int state_file(const char *name) {
  char file[4096];
  if (snprintf(file, sizeof(file), "%s/%s", GUARD_STATE, name) >= (int)sizeof(file)) fail("guard-path-too-long");
  int fd = open(file, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
  struct stat info;
  if (fd < 0 || fstat(fd, &info) || !S_ISREG(info.st_mode) ||
      info.st_uid != GUARD_STATE_OWNER || info.st_nlink != 1) fail("guard-state-unavailable");
  return fd;
}

static struct flock record_lock(short type, off_t first, off_t count) {
  struct flock lock = {0};
  lock.l_type = type;
  lock.l_whence = SEEK_SET;
  lock.l_start = first;
  lock.l_len = count;
  return lock;
}

static pid_t job_owner(int fd) {
  struct flock lock = record_lock(F_WRLCK, 0, 1);
  if (fcntl(fd, F_GETLK, &lock)) fail("job-budget-inspection-failed");
  return lock.l_type == F_UNLCK ? 0 : lock.l_pid;
}

static bool ancestor(pid_t target, pid_t child) {
  for (int depth = 0; child > 1 && depth < 128; depth++) {
    if (child == target) return true;
    struct proc_bsdinfo info;
    if (proc_pidinfo(child, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) return false;
    if ((pid_t)info.pbi_ppid == child) return false;
    child = (pid_t)info.pbi_ppid;
  }
  return false;
}

static bool owns_reservation(int fd, pid_t pid, long slot, long units) {
  if (slot < 0 || units <= 0 || slot + units > GUARD_BUDGET_MIB / GUARD_UNIT_MIB) return false;
  struct flock lock = record_lock(F_WRLCK, slot, units);
  if (fcntl(fd, F_GETLK, &lock)) return false;
  return lock.l_type == F_WRLCK && lock.l_pid == pid &&
    lock.l_start <= slot && lock.l_start + lock.l_len >= slot + units;
}

static int reserve_memory(int *first, int units);

static void activate(int argc, char **argv) {
  if (argc != 6 || geteuid() != 0) fail("kernel-limit-requires-authorized-helper");
  pid_t target = (pid_t)integer(argv[2]);
  long slot = integer(argv[3]), units = integer(argv[4]);
  pid_t holder = (pid_t)integer(argv[5]);
  long limit = units * GUARD_UNIT_MIB;
  if (target <= 1 || limit <= 0 || limit > GUARD_WORKER_MIB || !ancestor(target, getpid())) fail("foreign-kernel-limit-target");
  char executable[PROC_PIDPATHINFO_MAXSIZE];
  if (proc_pidpath(target, executable, sizeof(executable)) <= 0 || strcmp(executable, GUARD_REAL_NODE)) fail("foreign-node-runtime");
  int quota = state_file("memory.lock");
  struct proc_bsdinfo holder_info;
  char holder_executable[PROC_PIDPATHINFO_MAXSIZE];
  if (proc_pidinfo(holder, PROC_PIDTBSDINFO, 0, &holder_info, sizeof(holder_info)) != sizeof(holder_info) ||
      (pid_t)holder_info.pbi_ppid != target || proc_pidpath(holder, holder_executable, sizeof(holder_executable)) <= 0 ||
      strcmp(holder_executable, GUARD_PUBLIC_NODE) || !owns_reservation(quota, holder, slot, units)) fail("memory-reservation-missing");
  memory_limits limits = {(int32_t)limit, 1, (int32_t)limit, 1};
  if (memorystatus_control(7, target, 0, &limits, sizeof(limits))) fail("kernel-limit-apply-failed");
  memset(&limits, 0, sizeof(limits));
  if (memorystatus_control(8, target, 0, &limits, sizeof(limits)) ||
      limits.active != limit || limits.inactive != limit ||
      !(limits.active_attributes & 1) || !(limits.inactive_attributes & 1)) fail("kernel-limit-readback-failed");
  printf("{\"kernelLimitMiB\":%ld,\"fatal\":true}\n", limit);
  close(quota);
}

static void status(void) {
  struct utsname system;
  if (uname(&system) || strcmp(system.release, GUARD_KERNEL_RELEASE)) fail("kernel-version-revalidation-required");
  int quota = state_file("memory.lock");
  int jobs = state_file("job.lock");
  long reserved = 0;
  for (long slot = 0; slot < GUARD_BUDGET_MIB / GUARD_UNIT_MIB; slot++) {
    struct flock lock = record_lock(F_WRLCK, slot, 1);
    if (fcntl(quota, F_GETLK, &lock)) fail("memory-budget-inspection-failed");
    if (lock.l_type != F_UNLCK) reserved += GUARD_UNIT_MIB;
  }
  printf("{\"schema\":\"plush.node-kernel-guard/v1\",\"budgetMiB\":%d,\"reservedMiB\":%ld,\"jobOwner\":%d,\"kernel\":\"%s\",\"source\":\"%s\",\"node\":\"%s\"}\n",
    GUARD_BUDGET_MIB, reserved, job_owner(jobs), system.release, GUARD_SOURCE_SHA, GUARD_PUBLIC_NODE);
  close(quota);
  close(jobs);
}

static void timed_out(int signal_number) {
  (void)signal_number;
  const char message[] = "[qa:node-kernel] status=incomplete reason=shared-job-queue-timeout\n";
  write(STDERR_FILENO, message, sizeof(message) - 1);
  _exit(75);
}

static void job_stopped(int signal_number) {
  const char timed[] = "[qa:node-kernel] status=incomplete reason=native-job-timeout\n";
  const char interrupted[] = "[qa:node-kernel] status=incomplete reason=native-job-interrupted\n";
  if (signal_number == SIGALRM) write(STDERR_FILENO, timed, sizeof(timed) - 1);
  else write(STDERR_FILENO, interrupted, sizeof(interrupted) - 1);
  _exit(signal_number == SIGALRM ? 75 : 128 + signal_number);
}

// Kernel process-exit events tie guardians to one job. No polling, daemon or
// PID registry is needed, including when a client is killed with SIGKILL.
static int guardian(pid_t owner, pid_t target, bool whole_group, int inherited_fd, int units, pid_t *holder) {
  int ready[2];
  if (pipe(ready)) fail("guardian-pipe-failed");
  pid_t child = fork();
  if (child < 0) fail("guardian-start-failed");
  if (child == 0) {
    signal(SIGINT, SIG_IGN);
    signal(SIGTERM, SIG_IGN);
    close(ready[0]);
    if (inherited_fd >= 0) close(inherited_fd);
    int queue = kqueue();
    struct kevent changes[2];
    EV_SET(&changes[0], (uintptr_t)owner, EVFILT_PROC, EV_ADD | EV_ONESHOT, NOTE_EXIT, 0, NULL);
    int count = 1;
    if (target != owner) {
      EV_SET(&changes[1], (uintptr_t)target, EVFILT_PROC, EV_ADD | EV_ONESHOT, NOTE_EXIT, 0, NULL);
      count = 2;
    }
    struct { int ok; int slot; } response = {0, -1};
    response.ok = queue >= 0 && kevent(queue, changes, count, NULL, 0, NULL) == 0;
    int reservation = -1;
    if (response.ok && units > 0) reservation = reserve_memory(&response.slot, units);
    write(ready[1], &response, sizeof(response));
    close(ready[1]);
    if (!response.ok) _exit(75);
    struct kevent event;
    for (;;) {
      int result;
      do { result = kevent(queue, NULL, 0, &event, 1, NULL); } while (result < 0 && errno == EINTR);
      if (result <= 0) { kill(target, SIGKILL); _exit(75); }
      if (event.ident == (uintptr_t)owner) {
        if (whole_group) { kill(-target, SIGKILL); _exit(0); }
        kill(target, SIGKILL);
      }
      if (event.ident == (uintptr_t)target) break;
    }
    if (reservation >= 0) close(reservation);
    _exit(0);
  }
  close(ready[1]);
  struct { int ok; int slot; } response = {0, -1};
  ssize_t received;
  do { received = read(ready[0], &response, sizeof(response)); } while (received < 0 && errno == EINTR);
  close(ready[0]);
  if (received != sizeof(response) || !response.ok) fail("guardian-registration-failed");
  if (holder) *holder = child;
  return response.slot;
}

static void supervise_job(int job_fd, bool driver) {
  if (getpgrp() != getpid() && setpgid(0, 0)) fail("job-process-group-failed");
  guardian(getpid(), getpid(), true, job_fd, 0, NULL);
  pid_t child = fork();
  if (child < 0) fail("job-start-failed");
  if (child == 0) {
    close(job_fd);
    return;
  }
  signal(SIGALRM, job_stopped);
  signal(SIGTERM, job_stopped);
  signal(SIGINT, job_stopped);
  alarm(driver ? GUARD_SUITE_SECONDS : GUARD_JOB_SECONDS);
  int status_code;
  pid_t result;
  do { result = waitpid(child, &status_code, 0); } while (result < 0 && errno == EINTR);
  alarm(0);
  if (result < 0) fail("job-wait-failed");
  exit(WIFEXITED(status_code) ? WEXITSTATUS(status_code) : 128 + WTERMSIG(status_code));
}

static int reserve_memory(int *first, int units) {
  int fd = state_file("memory.lock");
  for (int slot = 0; slot + units <= GUARD_BUDGET_MIB / GUARD_UNIT_MIB; slot++) {
    struct flock lock = record_lock(F_WRLCK, slot, units);
    if (fcntl(fd, F_SETLK, &lock) == 0) {
      if (fcntl(fd, F_SETFD, 0)) fail("reservation-inheritance-failed");
      *first = slot;
      return fd;
    }
    if (errno != EACCES && errno != EAGAIN) fail("memory-budget-lock-failed");
  }
  fail("shared-memory-budget-exhausted");
  return -1;
}

static void set_number(const char *name, long value) {
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "%ld", value);
  if (setenv(name, buffer, 1)) fail("guard-environment-failed");
}

int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "--plush-guard-activate")) { activate(argc, argv); return 0; }
  if (argc == 2 && !strcmp(argv[1], "--plush-guard-status")) { status(); return 0; }
  if (argc == 3 && !strcmp(argv[1], "--plush-guard-reserve")) {
    int jobs = state_file("job.lock");
    pid_t owner = job_owner(jobs);
    long limit = integer(argv[2]);
    if (owner <= 1 || !ancestor(owner, getpid()) || limit <= 0 ||
        limit > GUARD_BUDGET_MIB || limit % GUARD_UNIT_MIB) fail("invalid-fixture-reservation");
    int first;
    int quota = reserve_memory(&first, (int)(limit / GUARD_UNIT_MIB));
    printf("{\"reservedMiB\":%ld}\n", limit);
    fflush(stdout);
    char byte;
    while (read(STDIN_FILENO, &byte, 1) > 0) {}
    close(quota);
    close(jobs);
    return 0;
  }
  bool explicit_test = false, driver = false, test_runner = false;
  bool before_entry = true, preload_value = false;
  for (int i = 1; i < argc; i++) {
    if (before_entry) {
      if (preload_value) preload_value = false;
      else if (!strcmp(argv[i], "--require") || !strcmp(argv[i], "-r") || !strcmp(argv[i], "--import") ||
               !strcmp(argv[i], "--loader") || !strcmp(argv[i], "--experimental-loader")) preload_value = true;
      else if (!strcmp(argv[i], "--test")) test_runner = true;
      else if (!strcmp(argv[i], "-e") || !strcmp(argv[i], "--eval") || !strcmp(argv[i], "-p") ||
               !strcmp(argv[i], "--print") || (argv[i][0] != '-' &&
               (strstr(argv[i], ".mjs") || strstr(argv[i], ".cjs") || strstr(argv[i], ".js")))) before_entry = false;
    }
    if (!strcmp(argv[i], "--test") || strstr(argv[i], ".test.mjs") || strstr(argv[i], ".test.cjs") ||
        strstr(argv[i], ".test.js") || strstr(argv[i], "node:test")) explicit_test = true;
    if (!strstr(argv[i], ".test.") && (strstr(argv[i], "scripts/qa/") || strstr(argv[i], "scripts/runUnitTests.mjs"))) driver = true;
  }
  int jobs = state_file("job.lock");
  pid_t owner = job_owner(jobs);
  bool descendant = owner > 1 && ancestor(owner, getpid());
  bool protected = explicit_test || driver || descendant || getenv("NODE_TEST_CONTEXT");
  if (protected) {
    struct utsname system;
    if (uname(&system) || strcmp(system.release, GUARD_KERNEL_RELEASE)) fail("kernel-version-revalidation-required");
    if (!descendant) {
      struct flock lock = record_lock(F_WRLCK, 0, 1);
      signal(SIGALRM, timed_out);
      alarm(GUARD_QUEUE_SECONDS);
      if (fcntl(jobs, F_SETLKW, &lock)) fail("shared-job-admission-failed");
      alarm(0);
      signal(SIGALRM, SIG_DFL);
      if (fcntl(jobs, F_SETFD, 0)) fail("job-inheritance-failed");
      owner = getpid();
      supervise_job(jobs, driver);
    } else close(jobs);
    int limit = process_memory_limit(driver ? GUARD_DRIVER_MIB : test_runner ? GUARD_RUNNER_MIB : GUARD_WORKER_MIB);
    pid_t holder;
    int first = guardian(owner, getpid(), false, -1, limit / GUARD_UNIT_MIB, &holder);
    set_number("PLUSH_NODE_GUARD_PID", getpid());
    set_number("PLUSH_NODE_GUARD_SLOT", first);
    set_number("PLUSH_NODE_GUARD_UNITS", limit / GUARD_UNIT_MIB);
    set_number("PLUSH_NODE_GUARD_HOLDER", holder);
    set_number("PLUSH_NODE_GUARD_JOB", owner);
    char heap[128];
    snprintf(heap, sizeof(heap), "--max-old-space-size=%d --max-semi-space-size=16", limit / 2);
    if (setenv("NODE_OPTIONS", heap, 1)) fail("guard-environment-failed");
    struct rlimit core = {0, 0};
    if (setrlimit(RLIMIT_CORE, &core)) fail("core-limit-failed");
  } else {
    close(jobs);
    unsetenv("PLUSH_NODE_GUARD_PID");
    unsetenv("PLUSH_NODE_GUARD_SLOT");
    unsetenv("PLUSH_NODE_GUARD_UNITS");
    unsetenv("PLUSH_NODE_GUARD_HOLDER");
    unsetenv("PLUSH_NODE_GUARD_JOB");
  }
  char **arguments = calloc((size_t)argc + 4, sizeof(char *));
  if (!arguments) fail("launcher-allocation-failed");
  arguments[0] = GUARD_REAL_NODE;
  arguments[1] = "--require";
  arguments[2] = GUARD_BOOTSTRAP;
  int next = 3;
  if (test_runner) arguments[next++] = "--test-concurrency=1";
  for (int i = 1; i < argc; i++) {
    if (test_runner && !strncmp(argv[i], "--test-concurrency=", 19)) continue;
    if (test_runner && !strcmp(argv[i], "--test-concurrency")) { i++; continue; }
    arguments[next++] = argv[i];
  }
  execv(GUARD_REAL_NODE, arguments);
  fail("node-exec-failed");
}
