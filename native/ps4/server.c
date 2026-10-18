/* ASTORA original console-local HTTP adapter. No LAN listener or PC dependency.
 */
#include "server.h"
#include "../vendor/cJSON.h"
#include "backend.h"
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>
#ifdef ASTORA_HOST_TEST
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#define net_socket() socket(AF_INET, SOCK_STREAM, 0)
#define net_recv(s, b, n) recv(s, b, n, 0)
#define net_send(s, b, n) send(s, b, n, 0)
#define net_close(s) close(s)
#else
#include <orbis/Net.h>
#include <orbis/libkernel.h>
#define net_socket() sceNetSocket("astora-local", 2, 1, 0)
#define net_recv(s, b, n) sceNetRecv(s, b, n, 0)
#define net_send(s, b, n) sceNetSend(s, b, n, 0)
#define net_close(s) sceNetSocketClose(s)
#endif
#define PORT 12840
#define MAX_REQUEST 16384
#define MAX_JSON (2 * 1024 * 1024)
#define MAX_JOBS 64
#define MAX_PACKAGE_SIZE 1099511627776ULL
static char asset_root[512], catalog_path[512], state_root[512], token[65];
static int listener = -1;
static int config_logged, index_logged;
static unsigned ui_event_count;
typedef struct {
  int id;
  char name[161], title[10];
  uint64_t size;
  int complete;
} Job;
static Job jobs[MAX_JOBS];
static int job_count;
static const char *str(const cJSON *o, const char *k) {
  const cJSON *v = cJSON_GetObjectItemCaseSensitive(o, k);
  return cJSON_IsString(v) ? v->valuestring : NULL;
}
static int bounded(const char *s, size_t max) {
  if (!s || !*s || strlen(s) > max)
    return 0;
  for (; *s; s++)
    if ((unsigned char)*s < 32)
      return 0;
  return 1;
}
static int valid_title(const char *s) {
  if (!s || strlen(s) != 9)
    return 0;
  for (size_t i = 0; i < 9; i++)
    if (i < 4 ? (s[i] < 'A' || s[i] > 'Z')
              : (s[i] < '0' || s[i] > '9'))
      return 0;
  return 1;
}
static int whole_number(const cJSON *v, uint64_t min, uint64_t max,
                        uint64_t *out) {
  if (!cJSON_IsNumber(v) || !(v->valuedouble >= (double)min) ||
      !(v->valuedouble <= (double)max))
    return 0;
  uint64_t value = (uint64_t)v->valuedouble;
  if ((double)value != v->valuedouble)
    return 0;
  *out = value;
  return 1;
}
static int supported_platform(const char *s) {
  return s && (!strcmp(s, "PS4") || !strcmp(s, "PS1") ||
               !strcmp(s, "PS2") || !strcmp(s, "PSP"));
}
static cJSON *strict_json(const char *s, size_t length) {
  /* Include the supplied terminator; require the entire body, not a prefix. */
  if (memchr(s, 0, length))
    return NULL;
  return cJSON_ParseWithLengthOpts(s, length + 1, NULL, 1);
}
static void copy(char *out, size_t cap, const char *v) {
  snprintf(out, cap, "%s", v ? v : "");
}
void ast_log(const char *label, int code) {
  char path[600];
  snprintf(path, sizeof(path), "%s/native-status.log",
           state_root[0] ? state_root : "/data/ASTORA");
  FILE *f = fopen(path, "a");
  if (f) {
    fprintf(f, "%s 0x%08X\n", label, (unsigned)code);
    fclose(f);
  }
}
static int send_all(int fd, const void *data, size_t size) {
  const char *p = data;
  while (size) {
    int n = (int)net_send(fd, p, size);
    if (n <= 0)
      return -1;
    p += n;
    size -= (size_t)n;
  }
  return 0;
}
static void reply(int fd, int status, const char *type, const void *body,
                  size_t length) {
  char h[1024];
  int n = snprintf(
      h, sizeof(h),
      "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: "
      "%zu\r\nConnection: close\r\nCache-Control: "
      "no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: "
      "no-referrer\r\nContent-Security-Policy: default-src 'self'; script-src "
      "'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src "
      "'self'; frame-ancestors 'none'; base-uri 'none'\r\n\r\n",
      status, status < 400 ? "OK" : "Error", type, length);
  if (n > 0 && (size_t)n < sizeof(h) && !send_all(fd, h, (size_t)n))
    send_all(fd, body, length);
}
static void json_reply(int fd, int status, cJSON *value) {
  char *s = cJSON_PrintUnformatted(value);
  if (s) {
    reply(fd, status, "application/json; charset=utf-8", s, strlen(s));
    free(s);
  }
  cJSON_Delete(value);
}
static void error_reply(int fd, int status, const char *message, int code) {
  cJSON *o = cJSON_CreateObject();
  cJSON_AddStringToObject(o, "error", message);
  cJSON_AddNumberToObject(o, "code", code);
  json_reply(fd, status, o);
}
static unsigned char *read_file(const char *path, size_t cap, size_t *length) {
  FILE *f = fopen(path, "rb");
  if (!f)
    return NULL;
  if (fseek(f, 0, SEEK_END)) {
    fclose(f);
    return NULL;
  }
  long len = ftell(f);
  if (len < 0 || (size_t)len > cap || fseek(f, 0, SEEK_SET)) {
    fclose(f);
    return NULL;
  }
  unsigned char *b = malloc((size_t)len + 1);
  if (!b) {
    fclose(f);
    return NULL;
  }
  size_t got = fread(b, 1, (size_t)len, f);
  fclose(f);
  if (got != (size_t)len) {
    free(b);
    return NULL;
  }
  b[got] = 0;
  *length = got;
  return b;
}
static int save_jobs(void) {
  char p[600], tmp[600];
  snprintf(p, sizeof(p), "%s/jobs.json", state_root);
  snprintf(tmp, sizeof(tmp), "%s/jobs.json.tmp", state_root);
  cJSON *a = cJSON_CreateArray();
  for (int i = 0; i < job_count; i++) {
    cJSON *o = cJSON_CreateObject();
    cJSON_AddNumberToObject(o, "id", jobs[i].id);
    cJSON_AddStringToObject(o, "name", jobs[i].name);
    cJSON_AddStringToObject(o, "titleId", jobs[i].title);
    cJSON_AddNumberToObject(o, "size", (double)jobs[i].size);
    cJSON_AddBoolToObject(o, "complete", jobs[i].complete);
    cJSON_AddItemToArray(a, o);
  }
  char *s = cJSON_PrintUnformatted(a);
  cJSON_Delete(a);
  if (!s)
    return -1;
  FILE *f = fopen(tmp, "wb");
  if (!f) {
    free(s);
    return -1;
  }
  size_t len = strlen(s);
  int ok = fwrite(s, 1, len, f) == len;
  free(s);
  if (fclose(f))
    ok = 0;
  if (!ok || rename(tmp, p))
    return -1;
  return 0;
}
static void load_jobs(void) {
  char p[600];
  snprintf(p, sizeof(p), "%s/jobs.json", state_root);
  size_t len = 0;
  unsigned char *b = read_file(p, 128 * 1024, &len);
  if (!b)
    return;
  cJSON *a = strict_json((char *)b, len);
  free(b);
  if (!cJSON_IsArray(a)) {
    cJSON_Delete(a);
    return;
  }
  const cJSON *o = NULL;
  cJSON_ArrayForEach(o, a) {
    const char *title = str(o, "titleId"), *name = str(o, "name");
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(o, "id"),
                *size = cJSON_GetObjectItemCaseSensitive(o, "size");
    const cJSON *complete = cJSON_GetObjectItemCaseSensitive(o, "complete");
    uint64_t task_id, package_size;
    if (job_count >= MAX_JOBS || !valid_title(title) || !bounded(name, 160) ||
        !whole_number(id, 0, 2147483647, &task_id) ||
        !whole_number(size, 8192, MAX_PACKAGE_SIZE, &package_size) ||
        !cJSON_IsBool(complete))
      continue;
    int duplicate = 0;
    for (int i = 0; i < job_count; i++)
      if (jobs[i].id == (int)task_id)
        duplicate = 1;
    if (duplicate)
      continue;
    Job *j = &jobs[job_count++];
    j->id = (int)task_id;
    j->size = package_size;
    copy(j->name, sizeof(j->name), name);
    copy(j->title, sizeof(j->title), title);
    j->complete = cJSON_IsTrue(complete);
    ast_restore_task(j->id, j->title, j->size);
  }
  cJSON_Delete(a);
}
static void list_jobs(int fd) {
  cJSON *a = cJSON_CreateArray();
  int changed = 0;
  for (int i = 0; i < job_count; i++) {
    Job *j = &jobs[i];
    AstProgress p = {0};
    int rc = ast_progress(j->id, &p);
    cJSON *o = cJSON_CreateObject();
    cJSON_AddNumberToObject(o, "id", j->id);
    cJSON_AddStringToObject(o, "name", j->name);
    cJSON_AddStringToObject(o, "titleId", j->title);
    cJSON_AddNumberToObject(o, "transferred", (double)p.transferred);
    cJSON_AddNumberToObject(o, "total", (double)p.total);
    cJSON_AddNumberToObject(o, "preparing", p.preparing);
    cJSON_AddNumberToObject(o, "copying", p.copying);
    cJSON_AddNumberToObject(o, "error", rc ? rc : p.error);
    if (!rc && p.installed && !j->complete) {
      j->complete = 1;
      changed = 1;
    }
    cJSON_AddStringToObject(o, "state",
                            j->complete ? "installed"
                            : rc        ? "unknown"
                            : p.error   ? "failed"
                                        : "transferring");
    cJSON_AddItemToArray(a, o);
  }
  if (changed)
    save_jobs();
  json_reply(fd, 200, a);
}
static int header_value(const char *request, const char *key, char *out,
                        size_t cap) {
  size_t n = strlen(key);
  int found = 0;
  out[0] = 0;
  const char *p = strstr(request, "\r\n");
  while (p) {
    p += 2;
    if (!*p || !strncmp(p, "\r\n", 2))
      break;
    const char *end = strstr(p, "\r\n");
    if (!end)
      break;
    if ((size_t)(end - p) > n && !strncasecmp(p, key, n) && p[n] == ':') {
      if (found)
        return -1;
      const char *v = p + n + 1;
      while (v < end && (*v == ' ' || *v == '\t'))
        v++;
      size_t l = (size_t)(end - v);
      if (l >= cap)
        return -1;
      memcpy(out, v, l);
      out[l] = 0;
      found = 1;
    }
    p = end;
  }
  return found;
}
static int json_media_type(const char *s) {
  if (strncasecmp(s, "application/json", 16))
    return 0;
  s += 16;
  while (*s == ' ' || *s == '\t')
    s++;
  return !*s || *s == ';';
}
static void handle(int fd) {
  char request[MAX_REQUEST + 1];
  size_t used = 0, head_len = 0, body_len = 0;
  char *end = NULL;
  while (used < MAX_REQUEST) {
    int n = (int)net_recv(fd, request + used, MAX_REQUEST - used);
    if (n <= 0)
      return;
    used += (size_t)n;
    if (memchr(request, 0, used)) {
      error_reply(fd, 400, "BAD_REQUEST", 0);
      return;
    }
    request[used] = 0;
    end = strstr(request, "\r\n\r\n");
    if (end)
      break;
  }
  if (!end) {
    error_reply(fd, 413, "REQUEST_TOO_LARGE", 0);
    return;
  }
  head_len = (size_t)(end - request) + 4;
  char method[8], path[512], host[100], origin[160], length[32], supplied[100],
      type[100], transfer[60];
  if (sscanf(request, "%7s %511s", method, path) != 2) {
    error_reply(fd, 400, "BAD_REQUEST", 0);
    return;
  }
  if (header_value(request, "Host", host, sizeof(host)) != 1 ||
      strcmp(host, "127.0.0.1:12840")) {
    error_reply(fd, 403, "HOST_REJECTED", 0);
    return;
  }
  int oh = header_value(request, "Origin", origin, sizeof(origin));
  if (oh < 0 || (oh == 1 && strcmp(origin, "http://127.0.0.1:12840"))) {
    error_reply(fd, 403, "ORIGIN_REJECTED", 0);
    return;
  }
  if (header_value(request, "Transfer-Encoding", transfer, sizeof(transfer)) !=
      0) {
    error_reply(fd, 400, "BAD_FRAMING", 0);
    return;
  }
  if (!strcmp(method, "GET") && !strcmp(path, "/api/config")) {
    if (!config_logged) {
      ast_log("ui_config_requested", 0);
      config_logged = 1;
    }
    cJSON *o = cJSON_CreateObject();
    cJSON_AddStringToObject(o, "token", token);
    cJSON_AddStringToObject(o, "mode", "ps4-native-experimental");
    cJSON_AddStringToObject(o, "version", "0.4.1-alpha.1");
    cJSON_AddBoolToObject(o, "pcRequired", 0);
    json_reply(fd, 200, o);
    return;
  }
  if (!strcmp(method, "GET") && !strcmp(path, "/api/jobs")) {
    list_jobs(fd);
    return;
  }
  if (!strcmp(method, "GET") && !strcmp(path, "/api/catalog")) {
    size_t len;
    unsigned char *b = read_file(catalog_path, MAX_JSON, &len);
    if (!b) {
      error_reply(fd, 500, "CATALOG_UNAVAILABLE", 0);
      return;
    }
    reply(fd, 200, "application/json; charset=utf-8", b, len);
    free(b);
    return;
  }
  if (!strcmp(method, "POST")) {
    if (header_value(request, "X-Astora-Token", supplied, sizeof(supplied)) !=
            1 ||
        strcmp(supplied, token) ||
        header_value(request, "Content-Type", type, sizeof(type)) != 1 ||
        !json_media_type(type)) {
      error_reply(fd, 403, "TOKEN_REQUIRED", 0);
      return;
    }
    int lh = header_value(request, "Content-Length", length, sizeof(length));
    if (lh < 0) {
      error_reply(fd, 400, "BAD_FRAMING", 0);
      return;
    }
    if (!lh) {
      error_reply(fd, 411, "LENGTH_REQUIRED", 0);
      return;
    }
    if (!*length || strspn(length, "0123456789") != strlen(length)) {
      error_reply(fd, 400, "BAD_FRAMING", 0);
      return;
    }
    char *tail;
    unsigned long bl = strtoul(length, &tail, 10);
    if (!*length || *tail || bl > MAX_REQUEST - head_len) {
      error_reply(fd, 413, "REQUEST_TOO_LARGE", 0);
      return;
    }
    body_len = (size_t)bl;
    while (used < head_len + body_len) {
      int n = (int)net_recv(fd, request + used, head_len + body_len - used);
      if (n <= 0)
        return;
      used += (size_t)n;
    }
    if (memchr(request + head_len, 0, body_len)) {
      error_reply(fd, 400, "INVALID_JSON", 0);
      return;
    }
    request[head_len + body_len] = 0;
    cJSON *o = strict_json(request + head_len, body_len);
    if (!cJSON_IsObject(o)) {
      cJSON_Delete(o);
      error_reply(fd, 400, "INVALID_JSON", 0);
      return;
    }
    if (!strcmp(path, "/api/ui-event")) {
      /* Fixed event names only: no source URLs, identifiers, or arbitrary log text. */
      const char *event = str(o, "event");
      const char *events[] = {"library_ready", "detail_opened", "detail_closed",
                              "inspect_clicked", "install_clicked", "ui_error"};
      int accepted = 0;
      for (size_t i = 0; event && i < sizeof(events) / sizeof(events[0]); i++) {
        if (!strcmp(event, events[i])) {
          accepted = 1;
          if (ui_event_count < 64) {
            char label[48];
            snprintf(label, sizeof(label), "ui_%s", events[i]);
            ast_log(label, 0);
            ui_event_count++;
          }
          break;
        }
      }
      cJSON_Delete(o);
      if (!accepted) {
        error_reply(fd, 400, "INVALID_UI_EVENT", 0);
        return;
      }
      reply(fd, 200, "application/json", "{\"ok\":true}", 11);
      return;
    }
    if (!strcmp(path, "/api/inspect")) {
      const cJSON *platform_value = cJSON_GetObjectItemCaseSensitive(o, "platform");
      if (platform_value && !supported_platform(str(o, "platform"))) {
        cJSON_Delete(o);
        error_reply(fd, 400, "UNSUPPORTED_PLATFORM", 0);
        return;
      }
      const char *url = str(o, "url");
      if (!bounded(url, 8192)) {
        cJSON_Delete(o);
        error_reply(fd, 400, "INVALID_URL", 0);
        return;
      }
      char title[10] = {0};
      uint64_t size = 0;
      ast_log("inspect_begin", 0);
      int rc = ast_inspect(url, title, &size);
      ast_log("inspect_end", rc);
      cJSON_Delete(o);
      if (rc) {
        error_reply(fd, 400, ast_backend_error(), rc);
        return;
      }
      o = cJSON_CreateObject();
      cJSON_AddStringToObject(o, "titleId", title);
      cJSON_AddNumberToObject(o, "size", (double)size);
      json_reply(fd, 200, o);
      return;
    }
    if (!strcmp(path, "/api/import")) {
      const char *url = str(o, "url");
      if (!bounded(url, 8192)) {
        cJSON_Delete(o);
        error_reply(fd, 400, "INVALID_URL", 0);
        return;
      }
      unsigned char *b = malloc(MAX_JSON + 1);
      size_t len = 0;
      int status = 0;
      int rc = b ? ast_http_get(url, b, MAX_JSON, &len, &status) : -1;
      cJSON_Delete(o);
      if (rc || status != 200) {
        free(b);
        error_reply(fd, 400, ast_backend_error(), rc ? rc : status);
        return;
      }
      b[len] = 0;
      cJSON *catalog = strict_json((char *)b, len);
      free(b);
      if (!cJSON_IsObject(catalog)) {
        cJSON_Delete(catalog);
        error_reply(fd, 400, "INVALID_CATALOG", 0);
        return;
      }
      json_reply(fd, 200, catalog);
      return;
    }
    if (!strcmp(path, "/api/install")) {
      const char *url = str(o, "url"), *name = str(o, "name"),
                 *title = str(o, "titleId"), *platform = str(o, "platform");
      const cJSON *sz = cJSON_GetObjectItemCaseSensitive(o, "size");
      uint64_t package_size;
      if (!bounded(url, 8192) || !bounded(name, 160) || !valid_title(title) ||
          !platform ||
          (!strcmp(platform, "PS3") || !strcmp(platform, "PS5")) ||
          !whole_number(sz, 8192, MAX_PACKAGE_SIZE, &package_size)) {
        cJSON_Delete(o);
        error_reply(fd, 400, "PS4_PACKAGE_REQUIRED", 0);
        return;
      }
      if (!supported_platform(platform)) {
        cJSON_Delete(o);
        error_reply(fd, 400, "UNSUPPORTED_PLATFORM", 0);
        return;
      }
      for (int i = 0; i < job_count; i++)
        if (!strcmp(title, jobs[i].title) && !jobs[i].complete) {
          AstProgress p = {0};
          int rc = ast_progress(jobs[i].id, &p);
          if (rc || !p.error) {
            cJSON_Delete(o);
            error_reply(fd, 409, "TASK_ALREADY_RECORDED", jobs[i].id);
            return;
          }
        }
      if (job_count >= MAX_JOBS) {
        cJSON_Delete(o);
        error_reply(fd, 409, "HISTORY_FULL", 0);
        return;
      }
      int task = -1;
      int rc = ast_install(url, name, title, package_size, &task);
      if (rc) {
        cJSON_Delete(o);
        error_reply(fd, 400, ast_backend_error(), rc);
        return;
      }
      Job *j = &jobs[job_count++];
      j->id = task;
      j->size = package_size;
      copy(j->name, sizeof(j->name), name);
      copy(j->title, sizeof(j->title), title);
      int saved = save_jobs() == 0;
      cJSON_Delete(o);
      o = cJSON_CreateObject();
      cJSON_AddNumberToObject(o, "taskId", task);
      cJSON_AddStringToObject(o, "state", "accepted");
      cJSON_AddBoolToObject(o, "stateSaved", saved);
      json_reply(fd, 202, o);
      return;
    }
    cJSON_Delete(o);
    error_reply(fd, 404, "NOT_FOUND", 0);
    return;
  }
  if (strcmp(method, "GET")) {
    error_reply(fd, 405, "METHOD_NOT_ALLOWED", 0);
    return;
  }
  if (strstr(path, "..") || strchr(path, '%') || strchr(path, '\\') ||
      strchr(path, '?') || strchr(path, '#')) {
    error_reply(fd, 400, "INVALID_PATH", 0);
    return;
  }
  if (!strcmp(path, "/"))
    copy(path, sizeof(path), "/index.html");
  char full[1100];
  snprintf(full, sizeof(full), "%s%s", asset_root, path);
  size_t len;
  unsigned char *b = read_file(full, 4 * 1024 * 1024, &len);
  if (!b) {
    error_reply(fd, 404, "NOT_FOUND", 0);
    return;
  }
  const char *ext = strrchr(path, '.');
  const char *mime = ext && !strcmp(ext, ".html") ? "text/html; charset=utf-8"
                     : ext && !strcmp(ext, ".js")
                         ? "text/javascript; charset=utf-8"
                     : ext && !strcmp(ext, ".css") ? "text/css; charset=utf-8"
                     : ext && !strcmp(ext, ".png") ? "image/png"
                     : ext && !strcmp(ext, ".svg") ? "image/svg+xml"
                     : ext && !strcmp(ext, ".ttf") ? "font/ttf"
                                                   : "application/octet-stream";
  reply(fd, 200, mime, b, len);
  if (!index_logged && !strcmp(path, "/index.html")) {
    ast_log("ui_index_served", 0);
    index_logged = 1;
  }
  free(b);
}
static void *worker(void *unused) {
  (void)unused;
  for (;;) {
    int client;
#ifdef ASTORA_HOST_TEST
    struct sockaddr_in peer;
    socklen_t n = sizeof(peer);
    client = accept(listener, (struct sockaddr *)&peer, &n);
    struct timeval tv = {5, 0};
    if (client >= 0) {
      setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
      setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    }
#else
    struct sockaddr_in peer;
    OrbisNetSocklen_t n = sizeof(peer);
    client = sceNetAccept(listener, (OrbisNetSockaddr *)&peer, &n);
    struct {
      int64_t sec, usec;
    } tv = {5, 0};
    if (client >= 0) {
      sceNetSetsockopt(client, 0xffff, 0x1006, &tv, sizeof(tv));
      sceNetSetsockopt(client, 0xffff, 0x1005, &tv, sizeof(tv));
    }
#endif
    if (client < 0)
      continue;
    handle(client);
    net_close(client);
  }
  return NULL;
}
int ast_server_start(const char *assets, const char *catalog,
                     const char *state) {
  copy(asset_root, sizeof(asset_root), assets);
  copy(catalog_path, sizeof(catalog_path), catalog);
  copy(state_root, sizeof(state_root), state);
  mkdir(state_root, 0777);
  unsigned char bytes[32];
  FILE *random = fopen("/dev/urandom", "rb");
  if (!random)
    return -1;
  size_t got = fread(bytes, 1, sizeof(bytes), random);
  fclose(random);
  if (got != sizeof(bytes))
    return -2;
  for (size_t i = 0; i < sizeof(bytes); i++)
    snprintf(token + i * 2, 3, "%02x", bytes[i]);
  load_jobs();
  listener = net_socket();
  if (listener < 0)
    return listener;
#ifdef ASTORA_HOST_TEST
  struct sockaddr_in address = {0};
  address.sin_family = AF_INET;
  address.sin_port = htons(PORT);
  address.sin_addr.s_addr = htonl(0x7f000001);
  int yes = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
  int rc = bind(listener, (struct sockaddr *)&address, sizeof(address));
  if (!rc)
    rc = listen(listener, 12);
#else
  struct sockaddr_in address = {0};
  address.sin_len = sizeof(address);
  address.sin_family = 2;
  address.sin_port = sceNetHtons(PORT);
  address.sin_addr.s_addr = sceNetHtonl(0x7f000001);
  int yes = 1;
  sceNetSetsockopt(listener, 0xffff, 4, &yes, sizeof(yes));
  int rc = sceNetBind(listener, (OrbisNetSockaddr *)&address, sizeof(address));
  if (!rc)
    rc = sceNetListen(listener, 12);
#endif
  if (rc) {
    net_close(listener);
    return rc;
  }
  pthread_t thread;
  rc = pthread_create(&thread, NULL, worker, NULL);
  if (rc) {
    net_close(listener);
    return -3;
  }
  pthread_detach(thread);
  ast_log("loopback_ready", 0);
  return 0;
}
