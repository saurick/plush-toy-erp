#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <unistd.h>

#include "tool-config.h"

static void fail(const char *reason) {
  fprintf(stderr, "[qa:tool-node] status=incomplete reason=%s\n", reason);
  exit(75);
}

static int requested_limit(const char *value, int ceiling) {
  if (!value || !*value) fail("invalid-heap-request");
  for (const char *digit = value; *digit; digit++) {
    if (*digit < '0' || *digit > '9') fail("invalid-heap-request");
  }
  char *end;
  errno = 0;
  long limit = strtol(value, &end, 10);
  if (errno || *end || limit <= 0 || limit > ceiling) fail("heap-request-exceeds-policy");
  return (int)limit;
}

int main(int argc, char **argv) {
  const char *options = getenv("NODE_OPTIONS");
  if (options && (strstr(options, "max-old") || strstr(options, "max_old") ||
      strstr(options, "max-semi") || strstr(options, "max_semi") ||
      strstr(options, "max-heap") || strstr(options, "max_heap") || strstr(options, "huge-max"))) {
    fail("node-options-heap-request-not-supported");
  }
  int heap = TOOL_HEAP_MIB, semi = 16, count = 0;
  bool test_runner = false;
  for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "--test")) test_runner = true;
  char **forwarded = calloc((size_t)argc + 1, sizeof(char *));
  if (!forwarded) fail("argument-allocation-failed");
  for (int i = 1; i < argc; i++) {
    if (test_runner && !strncmp(argv[i], "--test-concurrency=", 19)) continue;
    if (test_runner && !strcmp(argv[i], "--test-concurrency")) {
      if (++i >= argc) fail("invalid-test-concurrency");
      continue;
    }
    char key[256];
    size_t length = strcspn(argv[i], "=");
    if (length < sizeof(key)) {
      memcpy(key, argv[i], length);
      key[length] = 0;
      for (size_t j = 0; j < length; j++) if (key[j] == '_') key[j] = '-';
      bool old = !strcmp(key, "--max-old-space-size");
      bool young = !strcmp(key, "--max-semi-space-size");
      if (old || young) {
        const char *value = argv[i][length] == '=' ? argv[i] + length + 1 : i + 1 < argc ? argv[++i] : NULL;
        int limit = requested_limit(value, old ? TOOL_HEAP_MIB : 16);
        if (old && limit < heap) heap = limit;
        if (young && limit < semi) semi = limit;
        continue;
      }
      if (strstr(key, "max-old-space") || strstr(key, "max-heap-size") || strstr(key, "huge-max-old")) {
        fail("unsupported-heap-override");
      }
    }
    forwarded[count++] = argv[i];
  }
  char old[64], young[64], limit[32];
  snprintf(old, sizeof(old), "--max-old-space-size=%d", heap);
  snprintf(young, sizeof(young), "--max-semi-space-size=%d", semi);
  snprintf(limit, sizeof(limit), "%d", heap);
  if (setenv("PLUSH_NODE_TOOL_HEAP_MIB", limit, 1)) fail("heap-environment-failed");
  struct rlimit core = {0, 0};
  if (setrlimit(RLIMIT_CORE, &core)) fail("core-limit-failed");
  char **arguments = calloc((size_t)count + 8, sizeof(char *));
  if (!arguments) fail("argument-allocation-failed");
  arguments[0] = TOOL_REAL_NODE;
  arguments[1] = old;
  arguments[2] = young;
  arguments[3] = "--require";
  arguments[4] = TOOL_BOOTSTRAP;
  int next = 5;
  if (test_runner) arguments[next++] = "--test-concurrency=1";
  for (int i = 0; i < count; i++) arguments[next++] = forwarded[i];
  execv(TOOL_REAL_NODE, arguments);
  fail("node-exec-failed");
}
