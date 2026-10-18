/* Host-only fixture: real server.c, deterministic backend, no console APIs. */
#include "../ps4/backend.h"
#include "../ps4/server.h"
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static char call_path[1024];
static int next_task = 1000;

static void record(const char *method, int id) {
  FILE *f = fopen(call_path, "a");
  if (f) {
    fprintf(f, "%s %d\n", method, id);
    fclose(f);
  }
}

int ast_backend_init(void) { return 0; }
const char *ast_backend_error(void) { return "STUB_BACKEND_FAILURE"; }

int ast_http_get(const char *url, unsigned char *out, size_t cap,
                 size_t *length, int *http_status) {
  record("http_get", 0);
  const char *body = strstr(url, "invalid") ? "[]" :
      "{\"schemaVersion\":1,\"id\":\"fixture\",\"name\":\"Fixture\",\"items\":[]}";
  size_t len = strlen(body);
  if (len > cap) return AST_BACKEND_LIMIT;
  memcpy(out, body, len);
  *length = len;
  *http_status = 200;
  return 0;
}

int ast_inspect(const char *url, char title_id[10], uint64_t *size) {
  record("inspect", 0);
  if (strstr(url, "backend-error")) return AST_BACKEND_PACKAGE;
  memcpy(title_id, "ASTR00001", 10);
  *size = 16384;
  return 0;
}

int ast_install(const char *url, const char *name, const char *title_id,
                uint64_t size, int *task_id) {
  (void)name;
  (void)title_id;
  (void)size;
  record("install", 0);
  if (strstr(url, "backend-error")) return AST_BACKEND_REGISTER;
  *task_id = next_task++;
  return 0;
}

int ast_restore_task(int task_id, const char *title_id, uint64_t size) {
  (void)title_id;
  (void)size;
  record("restore", task_id);
  return 0;
}

int ast_progress(int task_id, AstProgress *out) {
  memset(out, 0, sizeof(*out));
  out->total = 16384;
  out->transferred = 4096;
  out->preparing = -1;
  out->copying = -1;
  if (task_id == 701) return AST_BACKEND_UNKNOWN_TASK;
  if (task_id == 702) out->error = AST_BACKEND_PROGRESS;
  if (task_id == 703) {
    out->transferred = out->total;
    out->installed = 1;
  }
  if (task_id == 704) out->transferred = out->total;
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: %s ASSET_ROOT CATALOG_JSON STATE_ROOT\n", argv[0]);
    return 2;
  }
  /* A disconnected test client should not terminate this host fixture. */
  signal(SIGPIPE, SIG_IGN);
  snprintf(call_path, sizeof(call_path), "%s/backend-calls.log", argv[3]);
  int rc = ast_server_start(argv[1], argv[2], argv[3]);
  if (rc) {
    fprintf(stderr, "ast_server_start failed: %d\n", rc);
    return 1;
  }
  puts("ASTORA host fixture listening on 127.0.0.1:12840");
  fflush(stdout);
  for (;;) pause();
}
