/* ASTORA's independent PS4 transport and installation adapter. MIT.
 *
 * ABI references (declarations only; implementation below is original):
 * https://github.com/OpenOrbis/OpenOrbis-PS4-Toolchain/tree/master/include/orbis
 * https://github.com/flatz/ps4_stub_lib_maker_v2/blob/master/include/bgft.h
 * PS4 uses 64-bit unsigned long. OpenOrbis 0.5.4 BGFT declarations incorrectly
 * narrow several of these fields; do not substitute those SDK structures.
 *
 * Native libHttp does not expose a documented DNS-address pinning API. This
 * prototype therefore permits exact reviewed GitHub HTTPS hostnames only,
 * checks their IPv4 DNS answer, disables automatic redirects/proxy/cookies,
 * and revalidates every redirect. It does not claim arbitrary-host SSRF safety
 * or replace TLS verification with a permissive callback. HTTP is rejected.
 * TLS root trust is the console's system trust store. Unsupported/expired TLS
 * fails closed; there is no HTTP fallback. BGFT receives the validated final
 * HTTPS URL, including its query, with CDN query modification disabled.
 */
#include "backend.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <limits.h>

#ifdef AST_BACKEND_HOST_TEST
extern uint64_t ast_test_clock(void);
static uint64_t now_us(void) { return ast_test_clock(); }
#else
#include <orbis/libkernel.h>
static uint64_t now_us(void) { return sceKernelGetProcessTime(); }
#endif

#define AST_URL_MAX 2048
#define AST_HEADER_BYTES 8192
#define AST_RESPONSE_HEADERS_MAX 16384
#define AST_BODY_MAX (2U * 1024U * 1024U)
#define AST_TASK_MAX 128
#define AST_REDIRECT_MAX 5
#define AST_DEADLINE_US UINT64_C(30000000)
#define AST_PACKAGE_MAX (UINT64_C(1024) * 1024 * 1024 * 1024)

typedef struct {
    void *heap;
    size_t heap_size;
} BgftInit;

typedef struct {
    int32_t user_id, entitlement_type;
    const char *id, *url, *extra_url, *name, *icon, *sku;
    int32_t options;
    const char *scenario, *release_date, *package_type, *package_subtype;
    uint64_t package_size;
} BgftDownload;

typedef struct {
    uint32_t bits;
    int32_t error;
    uint64_t length, transferred, length_total, transferred_total;
    uint32_t index, count, remaining_seconds, total_remaining_seconds;
    int32_t preparing, copying;
} BgftProgress;

_Static_assert(sizeof(BgftDownload) == 104, "PS4 BGFT download ABI");
_Static_assert(offsetof(BgftDownload, package_size) == 96, "PS4 BGFT size ABI");
_Static_assert(sizeof(BgftProgress) == 64, "PS4 BGFT progress ABI");
_Static_assert(offsetof(BgftProgress, preparing) == 56, "PS4 BGFT progress ABI");

typedef struct {
    int (*net_init)(void);
    int (*pool_create)(const char *, int, int);
    int (*pool_destroy)(int);
    int (*resolver_create)(const char *, int, int);
    int (*resolver_destroy)(int);
    int (*resolve)(int, const char *, void *, int, int, int);
    int (*ssl_init)(size_t);
    int (*ssl_term)(int);
    int (*http_init)(int, int, size_t);
    int (*http_term)(int);
    int (*template_create)(int, const char *, int, int);
    int (*template_delete)(int);
    int (*connection_create)(int, const char *, int);
    int (*connection_delete)(int);
    int (*request_create)(int, int, const char *, uint64_t);
    int (*request_delete)(int);
    int (*request_abort)(int);
    int (*set_redirect)(int, int);
    int (*set_cookie)(int, int);
    int (*set_auth)(int, int);
    int (*set_proxy)(int, int, int, const char *, uint16_t);
    int (*set_resolve_timeout)(int, uint32_t);
    int (*set_resolve_retry)(int, int);
    int (*set_connect_timeout)(int, uint32_t);
    int (*set_send_timeout)(int, uint32_t);
    int (*set_recv_timeout)(int, uint32_t);
    int (*set_header_max)(int, uint64_t);
    int (*tls_enable)(int, uint32_t);
    int (*add_header)(int, const char *, const char *, int);
    int (*send)(int, const void *, size_t);
    int (*read)(int, void *, uint64_t);
    int (*status)(int, int *);
    int (*headers)(int, char **, size_t *);
    int (*bgft_init)(BgftInit *);
    int (*bgft_register)(BgftDownload *, int *);
    int (*bgft_start)(int);
    int (*bgft_progress)(int, BgftProgress *);
    int (*app_init)(void);
    int (*app_exists)(const char *, int *);
    int (*user_init)(void *);
    int (*initial_user)(int *);
} NativeApi;

typedef struct {
    int used, id, installed;
    uint64_t size;
    char title_id[10];
} OwnedTask;

typedef struct {
    char content_id[37];
    char title_id[10];
    uint64_t size;
} PackageInfo;

typedef struct {
    char host[254];
    size_t origin_length;
} ParsedUrl;

static NativeApi api;
static int ready;
static int installer_ready;
static int application_service_ready;
static int pool = -1, ssl = -1, http = -1;
static void *bgft_heap;
static OwnedTask tasks[AST_TASK_MAX];
static char error_text[256] = "OK";

static int fail(int code, const char *format, ...) {
    va_list arguments;
    va_start(arguments, format);
    vsnprintf(error_text, sizeof(error_text), format, arguments);
    va_end(arguments);
    return code;
}

static void clear_error(void) { memcpy(error_text, "OK", 3); }
const char *ast_backend_error(void) { return error_text; }

static size_t bounded_length(const char *text, size_t limit) {
    size_t length = 0;
    while (length < limit && text[length]) ++length;
    return length;
}

static int ascii_upper(unsigned char c) { return c >= 'A' && c <= 'Z'; }
static int ascii_digit(unsigned char c) { return c >= '0' && c <= '9'; }
static unsigned char ascii_lower(unsigned char c) {
    return ascii_upper(c) ? (unsigned char)(c + ('a' - 'A')) : c;
}
static int same_ascii(const char *a, const char *b, size_t n) {
    for (size_t i = 0; i < n; ++i)
        if (ascii_lower((unsigned char)a[i]) != ascii_lower((unsigned char)b[i])) return 0;
    return 1;
}

static int reviewed_host(const char *host) {
    static const char *const hosts[] = {
        "github.com", "api.github.com", "raw.githubusercontent.com",
        "objects.githubusercontent.com", "release-assets.githubusercontent.com",
        "github-releases.githubusercontent.com"
    };
    for (size_t i = 0; i < sizeof(hosts) / sizeof(hosts[0]); ++i)
        if (strcmp(host, hosts[i]) == 0) return 1;
    return 0;
}

static int parse_url(const char *url, ParsedUrl *out) {
    if (!url || !out) return fail(AST_BACKEND_ARGUMENT, "INVALID_ARGUMENT");
    size_t n = bounded_length(url, AST_URL_MAX);
    if (n < 9 || n >= AST_URL_MAX) return fail(AST_BACKEND_URL, "INVALID_URL_LENGTH");
    if (!same_ascii(url, "https://", 8))
        return fail(AST_BACKEND_TLS, "HTTPS_REQUIRED: native prototype has no insecure fallback");
    for (size_t i = 0; i < n; ++i) {
        unsigned char c = (unsigned char)url[i];
        if (c <= 32 || c >= 127 || c == '\\' || c == '#')
            return fail(AST_BACKEND_URL, "INVALID_URL_CHARACTER");
        if (c == '%') {
            if (i + 2 >= n) return fail(AST_BACKEND_URL, "INVALID_URL_ESCAPE");
            unsigned char a = ascii_lower((unsigned char)url[i + 1]);
            unsigned char b = ascii_lower((unsigned char)url[i + 2]);
            if ((!ascii_digit(a) && (a < 'a' || a > 'f')) ||
                (!ascii_digit(b) && (b < 'a' || b > 'f')))
                return fail(AST_BACKEND_URL, "INVALID_URL_ESCAPE");
            /* Reject encoded control characters and backslash as well. */
            unsigned value = (unsigned)(ascii_digit(a) ? a - '0' : a - 'a' + 10) * 16U +
                             (unsigned)(ascii_digit(b) ? b - '0' : b - 'a' + 10);
            if (value < 32 || value == 127 || value == '\\')
                return fail(AST_BACKEND_URL, "INVALID_URL_ESCAPE");
            i += 2;
        }
    }
    size_t end = 8;
    while (end < n && url[end] != '/' && url[end] != '?') ++end;
    size_t host_end = end;
    for (size_t i = 8; i < end; ++i) {
        unsigned char c = (unsigned char)url[i];
        if (c == ':' && host_end == end) host_end = i;
        else if (!(ascii_upper(c) || (c >= 'a' && c <= 'z') || ascii_digit(c) || c == '.' || c == '-'))
            return fail(AST_BACKEND_URL, "INVALID_URL_AUTHORITY");
    }
    if (host_end != end && (end - host_end != 4 || memcmp(url + host_end, ":443", 4)))
        return fail(AST_BACKEND_URL, "UNSUPPORTED_PORT");
    size_t host_length = host_end - 8;
    if (!host_length || host_length >= sizeof(out->host)) return fail(AST_BACKEND_URL, "INVALID_HOST");
    for (size_t i = 0; i < host_length; ++i) out->host[i] = (char)ascii_lower((unsigned char)url[i + 8]);
    out->host[host_length] = 0;
    out->origin_length = end;
    if (!reviewed_host(out->host))
        return fail(AST_BACKEND_UNSUPPORTED_HOST, "UNSUPPORTED_HOST: native prototype accepts reviewed GitHub HTTPS hosts only");
    return 0;
}

static int public_ipv4(const unsigned char ip[4]) {
    if (ip[0] == 0 || ip[0] == 10 || ip[0] == 127 || ip[0] >= 224) return 0;
    if (ip[0] == 100 && ip[1] >= 64 && ip[1] <= 127) return 0;
    if (ip[0] == 169 && ip[1] == 254) return 0;
    if (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) return 0;
    if (ip[0] == 192 && (ip[1] == 168 || (ip[1] == 0 && (ip[2] == 0 || ip[2] == 2)))) return 0;
    if (ip[0] == 192 && ip[1] == 88 && ip[2] == 99) return 0;
    if (ip[0] == 198 && (ip[1] == 18 || ip[1] == 19 || (ip[1] == 51 && ip[2] == 100))) return 0;
    if (ip[0] == 203 && ip[1] == 0 && ip[2] == 113) return 0;
    return 1;
}

static uint32_t remaining_us(uint64_t deadline) {
    uint64_t now = now_us();
    if (now >= deadline) return 0;
    uint64_t remaining = deadline - now;
    return (uint32_t)(remaining > UINT32_MAX ? UINT32_MAX : remaining);
}

static int check_dns(const char *host, uint64_t deadline) {
    uint32_t budget = remaining_us(deadline);
    if (budget < 1000000) return fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT");
    int resolver = api.resolver_create("astora_dns", pool, 0);
    if (resolver < 0) return fail(AST_BACKEND_DNS, "DNS_CREATE_FAILED: 0x%08X", (unsigned)resolver);
    unsigned char address[4] = {0};
    if (budget > 3000000) budget = 3000000;
    int result = api.resolve(resolver, host, address, (int)budget, 1, 0);
    api.resolver_destroy(resolver);
    if (result < 0) return fail(AST_BACKEND_DNS, "DNS_FAILED: 0x%08X", (unsigned)result);
    if (!public_ipv4(address)) return fail(AST_BACKEND_PRIVATE_ADDRESS, "PRIVATE_ADDRESS_BLOCKED");
    return 0;
}

/* Extract exactly one response field from the library-owned bounded block.
 * Duplicate fields relevant to URL/size validation are rejected. */
static int header_value(const char *headers, size_t length, const char *name,
                        char *out, size_t capacity) {
    size_t name_length = strlen(name), at = 0;
    int found = 0;
    if (!out || !capacity) return -1;
    out[0] = 0;
    while (at < length) {
        size_t end = at;
        while (end < length && headers[end] != '\n' && headers[end] != 0) ++end;
        size_t trimmed = end;
        if (trimmed > at && headers[trimmed - 1] == '\r') --trimmed;
        if (trimmed - at > name_length && headers[at + name_length] == ':' &&
            same_ascii(headers + at, name, name_length)) {
            if (found++) return -1;
            size_t begin = at + name_length + 1;
            while (begin < trimmed && (headers[begin] == ' ' || headers[begin] == '\t')) ++begin;
            while (trimmed > begin && (headers[trimmed - 1] == ' ' || headers[trimmed - 1] == '\t')) --trimmed;
            size_t count = trimmed - begin;
            if (count >= capacity) return -1;
            memcpy(out, headers + begin, count);
            out[count] = 0;
        }
        if (end == length || headers[end] == 0) break;
        at = end + 1;
    }
    return found;
}

static int parse_uint64(const char **cursor, uint64_t *out) {
    const char *p = *cursor;
    uint64_t value = 0;
    if (!ascii_digit((unsigned char)*p)) return 0;
    while (ascii_digit((unsigned char)*p)) {
        unsigned digit = (unsigned)(*p++ - '0');
        if (value > (UINT64_MAX - digit) / 10) return 0;
        value = value * 10 + digit;
    }
    *cursor = p;
    *out = value;
    return 1;
}

static int response_size(int status, int prefix, const char *headers, size_t header_length,
                         uint64_t *total, uint64_t *body_length) {
    char value[128];
    *total = *body_length = 0;
    int has_length = header_value(headers, header_length, "Content-Length", value, sizeof(value));
    if (has_length < 0) return fail(AST_BACKEND_HTTP, "INVALID_CONTENT_LENGTH");
    if (has_length) {
        const char *cursor = value;
        if (!parse_uint64(&cursor, body_length) || *cursor)
            return fail(AST_BACKEND_HTTP, "INVALID_CONTENT_LENGTH");
    }
    if (status == 200) { *total = *body_length; return 0; }
    if (status != 206 || !prefix) return fail(AST_BACKEND_HTTP, "UNEXPECTED_PARTIAL_RESPONSE");
    int has_range = header_value(headers, header_length, "Content-Range", value, sizeof(value));
    const char *cursor = value;
    uint64_t start = 0, end = 0;
    if (has_range != 1 || strncmp(cursor, "bytes ", 6)) return fail(AST_BACKEND_HTTP, "INVALID_CONTENT_RANGE");
    cursor += 6;
    if (!parse_uint64(&cursor, &start) || *cursor++ != '-' ||
        !parse_uint64(&cursor, &end) || *cursor++ != '/' ||
        !parse_uint64(&cursor, total) || *cursor || start != 0 ||
        end < start || end >= *total || end != AST_HEADER_BYTES - 1 ||
        (has_length && *body_length != end + 1))
        return fail(AST_BACKEND_HTTP, "INVALID_CONTENT_RANGE");
    *body_length = end + 1;
    return 0;
}

static int redirect_url(const char *current, const ParsedUrl *parsed, const char *location,
                        char out[AST_URL_MAX]) {
    size_t n = strlen(location);
    if (!n || n >= AST_URL_MAX) return fail(AST_BACKEND_REDIRECT, "INVALID_REDIRECT");
    int count;
    if (strstr(location, "://")) count = snprintf(out, AST_URL_MAX, "%s", location);
    else if (location[0] == '/' && location[1] == '/') count = snprintf(out, AST_URL_MAX, "https:%s", location);
    else if (location[0] == '/') count = snprintf(out, AST_URL_MAX, "%.*s%s", (int)parsed->origin_length, current, location);
    else {
        size_t path_end = strcspn(current, "?");
        if (location[0] != '?') {
            while (path_end > parsed->origin_length && current[path_end - 1] != '/') --path_end;
        }
        count = snprintf(out, AST_URL_MAX, "%.*s%s%s", (int)path_end, current,
                         path_end == parsed->origin_length && location[0] != '?' ? "/" : "", location);
    }
    if (count < 0 || count >= AST_URL_MAX) return fail(AST_BACKEND_REDIRECT, "REDIRECT_URL_TOO_LONG");
    ParsedUrl validation;
    return parse_url(out, &validation);
}

#ifndef AST_BACKEND_HOST_TEST
static int module_for(const char *path, const char *marker) {
    OrbisKernelModule modules[512];
    size_t count = 0;
    if (sceKernelGetModuleList(modules, 512, &count) == 0) {
        if (count > 512) count = 512;
        for (size_t i = 0; i < count; ++i) {
            void *symbol = NULL;
            if (sceKernelDlsym(modules[i], marker, &symbol) == 0 && symbol) return modules[i];
        }
    }
    return (int)sceKernelLoadStartModule(path, 0, NULL, 0, NULL, NULL);
}

static int symbol(int module, const char *name, void *target) {
    void *address = NULL;
    int result = sceKernelDlsym(module, name, &address);
    if (result < 0 || !address) return fail(AST_BACKEND_MODULE, "MISSING_NATIVE_SYMBOL: %s", name);
    memcpy(target, &address, sizeof(address));
    return 0;
}

#define BIND(module, member, name) do { \
    int bind_result = symbol((module), (name), &api.member); \
    if (bind_result) return bind_result; \
} while (0)

static int resolve_transport(void) {
    int net = module_for("/system/common/lib/libSceNet.sprx", "sceNetPoolCreate");
    int secure = module_for("/system/common/lib/libSceSsl.sprx", "sceSslInit");
    int transport = module_for("/system/common/lib/libSceHttp.sprx", "sceHttpInit");
    if (net < 0 || secure < 0 || transport < 0)
        return fail(AST_BACKEND_MODULE, "TRANSPORT_MODULE_LOAD_FAILED: net=0x%08X ssl=0x%08X http=0x%08X",
                    (unsigned)net, (unsigned)secure, (unsigned)transport);
    BIND(net, net_init, "sceNetInit");
    BIND(net, pool_create, "sceNetPoolCreate");
    BIND(net, pool_destroy, "sceNetPoolDestroy");
    BIND(net, resolver_create, "sceNetResolverCreate");
    BIND(net, resolver_destroy, "sceNetResolverDestroy");
    BIND(net, resolve, "sceNetResolverStartNtoa");
    BIND(secure, ssl_init, "sceSslInit");
    BIND(secure, ssl_term, "sceSslTerm");
    BIND(transport, http_init, "sceHttpInit");
    BIND(transport, http_term, "sceHttpTerm");
    BIND(transport, template_create, "sceHttpCreateTemplate");
    BIND(transport, template_delete, "sceHttpDeleteTemplate");
    BIND(transport, connection_create, "sceHttpCreateConnectionWithURL");
    BIND(transport, connection_delete, "sceHttpDeleteConnection");
    BIND(transport, request_create, "sceHttpCreateRequestWithURL");
    BIND(transport, request_delete, "sceHttpDeleteRequest");
    BIND(transport, request_abort, "sceHttpAbortRequest");
    BIND(transport, set_redirect, "sceHttpSetAutoRedirect");
    BIND(transport, set_cookie, "sceHttpSetCookieEnabled");
    BIND(transport, set_auth, "sceHttpSetAuthEnabled");
    BIND(transport, set_proxy, "sceHttpSetProxy");
    BIND(transport, set_resolve_timeout, "sceHttpSetResolveTimeOut");
    BIND(transport, set_resolve_retry, "sceHttpSetResolveRetry");
    BIND(transport, set_connect_timeout, "sceHttpSetConnectTimeOut");
    BIND(transport, set_send_timeout, "sceHttpSetSendTimeOut");
    BIND(transport, set_recv_timeout, "sceHttpSetRecvTimeOut");
    BIND(transport, set_header_max, "sceHttpSetResponseHeaderMaxSize");
    BIND(transport, tls_enable, "sceHttpsEnableOption");
    BIND(transport, add_header, "sceHttpAddRequestHeader");
    BIND(transport, send, "sceHttpSendRequest");
    BIND(transport, read, "sceHttpReadData");
    BIND(transport, status, "sceHttpGetStatusCode");
    BIND(transport, headers, "sceHttpGetAllResponseHeaders");
    return 0;
}

static int resolve_installer(void) {
    int background = module_for("/system/common/lib/libSceBgft.sprx", "sceBgftServiceDownloadGetProgress");
    int applications = module_for("/system/common/lib/libSceAppInstUtil.sprx", "sceAppInstUtilInitialize");
    int users = module_for("/system/common/lib/libSceUserService.sprx", "sceUserServiceGetInitialUser");
    if (background < 0 || applications < 0 || users < 0)
        return fail(AST_BACKEND_MODULE, "INSTALLER_MODULE_LOAD_FAILED");
    if (symbol(background, "sceBgftServiceInit", &api.bgft_init))
        BIND(background, bgft_init, "sceBgftServiceIntInit");
    BIND(background, bgft_register, "sceBgftServiceIntDebugDownloadRegisterPkg");
    BIND(background, bgft_start, "sceBgftServiceDownloadStartTask");
    BIND(background, bgft_progress, "sceBgftServiceDownloadGetProgress");
    BIND(applications, app_init, "sceAppInstUtilInitialize");
    BIND(applications, app_exists, "sceAppInstUtilAppExists");
    BIND(users, user_init, "sceUserServiceInitialize");
    BIND(users, initial_user, "sceUserServiceGetInitialUser");
    clear_error();
    return 0;
}
#else
/* Tests supply function pointers. No console APIs or networking are simulated
 * implicitly: missing functions remain failures instead of fake successes. */
static int resolve_transport(void) { return api.net_init ? 0 : AST_BACKEND_MODULE; }
static int resolve_installer(void) { return api.bgft_init ? 0 : AST_BACKEND_MODULE; }
#endif

int ast_backend_init(void) {
    clear_error();
    if (ready) return 0;
    int result = resolve_transport();
    if (result) return result;
    int net_result = api.net_init();
    /* Pool creation is also the readiness probe when the local UI initialized
     * network first. Never terminate process-wide network state owned by it. */
    pool = api.pool_create("astora_http", 1024 * 1024, 0);
    if (pool < 0) return fail(AST_BACKEND_NETWORK, "NETWORK_INIT_FAILED: init=0x%08X pool=0x%08X",
                              (unsigned)net_result, (unsigned)pool);
    ssl = api.ssl_init(1024 * 1024);
    if (ssl >= 0) http = api.http_init(pool, ssl, 2 * 1024 * 1024);
    if (ssl < 0 || http < 0) {
        int ssl_error = ssl, http_error = http;
        if (ssl >= 0) api.ssl_term(ssl);
        api.pool_destroy(pool);
        pool = ssl = http = -1;
        return fail(AST_BACKEND_NETWORK, "HTTP_INIT_FAILED: ssl=0x%08X http=0x%08X",
                    (unsigned)ssl_error, (unsigned)http_error);
    }
    ready = 1;
    return 0;
}

static int init_installer(void) {
    if (installer_ready) return 0;
    int result = resolve_installer();
    if (result) return result;
    if (!application_service_ready) {
        result = api.app_init();
        if (result < 0) return fail(AST_BACKEND_SERVICE, "APP_SERVICE_INIT_FAILED: 0x%08X", (unsigned)result);
        application_service_ready = 1;
    }
    bgft_heap = calloc(1, 1024 * 1024);
    if (!bgft_heap) return fail(AST_BACKEND_CAPACITY, "OUT_OF_MEMORY");
    BgftInit parameters = {bgft_heap, 1024 * 1024};
    result = api.bgft_init(&parameters);
    if (result < 0) {
        free(bgft_heap); bgft_heap = NULL;
        return fail(AST_BACKEND_SERVICE, "BGFT_INIT_FAILED: 0x%08X", (unsigned)result);
    }
    /* BGFT retains this client heap. Keep it alive until process exit. */
    installer_ready = 1;
    return 0;
}

static int request_timeouts(int template_id, uint64_t deadline) {
    uint32_t remaining = remaining_us(deadline);
    if (remaining < 5000000) return fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT");
    uint32_t slice = remaining / 5;
    if (slice > 5000000) slice = 5000000;
    int result = api.set_resolve_timeout(template_id, slice);
    if (!result) result = api.set_resolve_retry(template_id, 0);
    if (!result) result = api.set_connect_timeout(template_id, slice);
    if (!result) result = api.set_send_timeout(template_id, slice);
    if (!result) result = api.set_recv_timeout(template_id, slice);
    if (result) return fail(AST_BACKEND_HTTP, "HTTP_TIMEOUT_CONFIGURATION_FAILED: 0x%08X", (unsigned)result);
    return 0;
}

static int get_remote(const char *url, unsigned char *out, size_t capacity,
                      size_t *length, int *status, int prefix,
                      char final_url[AST_URL_MAX], uint64_t *remote_size) {
    if (!url || !out || !length || !status || !capacity || capacity > AST_BODY_MAX)
        return fail(AST_BACKEND_ARGUMENT, "INVALID_ARGUMENT");
    *length = 0; *status = 0;
    if (remote_size) *remote_size = 0;
    if (!ready) return fail(AST_BACKEND_NOT_READY, "BACKEND_NOT_INITIALIZED");
    ParsedUrl parsed;
    int result = parse_url(url, &parsed);
    if (result) return result;
    char current[AST_URL_MAX];
    memcpy(current, url, strlen(url) + 1);
    uint64_t deadline = now_us() + AST_DEADLINE_US;
    for (unsigned redirects = 0; redirects <= AST_REDIRECT_MAX; ++redirects) {
        int template_id = -1, connection = -1, request = -1;
        uint64_t total = 0, response_length = 0;
        char next[AST_URL_MAX] = {0};
        result = parse_url(current, &parsed);
        if (result) return result;
        result = check_dns(parsed.host, deadline);
        if (result) return result;
        template_id = api.template_create(http, "ASTORA/0.4 (PS4)", 2, 0);
        if (template_id < 0) { result = fail(AST_BACKEND_HTTP, "HTTP_TEMPLATE_FAILED: 0x%08X", (unsigned)template_id); goto cleanup; }
        result = request_timeouts(template_id, deadline);
        if (result) goto cleanup;
        if (api.set_redirect(template_id, 0) || api.set_cookie(template_id, 0) ||
            api.set_auth(template_id, 0) || api.set_proxy(template_id, 0, 0, NULL, 0) ||
            api.set_header_max(template_id, AST_RESPONSE_HEADERS_MAX)) {
            result = fail(AST_BACKEND_HTTP, "HTTP_POLICY_CONFIGURATION_FAILED"); goto cleanup;
        }
        /* SERVER_VERIFY | CN_CHECK | NOT_AFTER | NOT_BEFORE | KNOWN_CA. */
        if (api.tls_enable(template_id, 0x3d)) { result = fail(AST_BACKEND_TLS, "TLS_VERIFICATION_CONFIGURATION_FAILED"); goto cleanup; }
        connection = api.connection_create(template_id, current, 0);
        if (connection < 0) { result = fail(AST_BACKEND_HTTP, "HTTP_CONNECTION_FAILED: 0x%08X", (unsigned)connection); goto cleanup; }
        request = api.request_create(connection, 0, current, 0);
        if (request < 0) { result = fail(AST_BACKEND_HTTP, "HTTP_REQUEST_FAILED: 0x%08X", (unsigned)request); goto cleanup; }
        if (api.add_header(request, "Accept-Encoding", "identity", 0) ||
            (prefix && api.add_header(request, "Range", "bytes=0-8191", 0))) {
            result = fail(AST_BACKEND_HTTP, "HTTP_REQUEST_HEADER_FAILED"); goto cleanup;
        }
        int native_result = api.send(request, NULL, 0);
        if (native_result < 0) {
            result = fail((uint32_t)native_result == 0x80431075U ? AST_BACKEND_TLS : AST_BACKEND_HTTP,
                          "HTTPS_REQUEST_FAILED: 0x%08X", (unsigned)native_result); goto cleanup;
        }
        if (!remaining_us(deadline)) { result = fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT"); goto cleanup; }
        if (api.status(request, status)) { result = fail(AST_BACKEND_HTTP, "HTTP_STATUS_FAILED"); goto cleanup; }
        char *headers = NULL;
        size_t header_length = 0;
        if (api.headers(request, &headers, &header_length) || !headers || header_length > AST_RESPONSE_HEADERS_MAX) {
            result = fail(AST_BACKEND_HTTP, "HTTP_RESPONSE_HEADERS_FAILED"); goto cleanup;
        }
        if (*status == 301 || *status == 302 || *status == 303 || *status == 307 || *status == 308) {
            char location[AST_URL_MAX];
            if (redirects == AST_REDIRECT_MAX) { result = fail(AST_BACKEND_REDIRECT, "TOO_MANY_REDIRECTS"); goto cleanup; }
            if (header_value(headers, header_length, "Location", location, sizeof(location)) != 1) {
                result = fail(AST_BACKEND_REDIRECT, "INVALID_REDIRECT_LOCATION"); goto cleanup;
            }
            result = redirect_url(current, &parsed, location, next);
            goto cleanup;
        }
        if (*status != 200 && !(prefix && *status == 206)) {
            result = fail(AST_BACKEND_HTTP, "SOURCE_HTTP_ERROR: %d", *status); goto cleanup;
        }
        char encoding[64];
        int encoded = header_value(headers, header_length, "Content-Encoding", encoding, sizeof(encoding));
        if (encoded < 0 || (encoded && strcmp(encoding, "identity"))) {
            result = fail(AST_BACKEND_HTTP, "UNSUPPORTED_CONTENT_ENCODING"); goto cleanup;
        }
        result = response_size(*status, prefix, headers, header_length, &total, &response_length);
        if (result) goto cleanup;
        if (!prefix && response_length > capacity) { result = fail(AST_BACKEND_LIMIT, "RESPONSE_TOO_LARGE"); goto cleanup; }
        while (*length < capacity) {
            uint32_t timeout = remaining_us(deadline);
            if (!timeout) { result = fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT"); goto cleanup; }
            if (timeout > 5000000) timeout = 5000000;
            if (api.set_recv_timeout(request, timeout)) { result = fail(AST_BACKEND_HTTP, "HTTP_TIMEOUT_CONFIGURATION_FAILED"); goto cleanup; }
            size_t wanted = capacity - *length;
            if (wanted > 32768) wanted = 32768;
            int count = api.read(request, out + *length, (uint32_t)wanted);
            if (count < 0 || (size_t)count > wanted) { result = fail(AST_BACKEND_HTTP, "HTTP_READ_FAILED: 0x%08X", (unsigned)count); goto cleanup; }
            if (!count) break;
            *length += (size_t)count;
        }
        if (!prefix && *length == capacity) {
            unsigned char extra;
            uint32_t timeout = remaining_us(deadline);
            if (!timeout) { result = fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT"); goto cleanup; }
            if (timeout > 5000000) timeout = 5000000;
            api.set_recv_timeout(request, timeout);
            int count = api.read(request, &extra, 1);
            if (count > 0) { result = fail(AST_BACKEND_LIMIT, "RESPONSE_TOO_LARGE"); goto cleanup; }
            if (count < 0) { result = fail(AST_BACKEND_HTTP, "HTTP_READ_FAILED: 0x%08X", (unsigned)count); goto cleanup; }
        }
        if (!remaining_us(deadline)) { result = fail(AST_BACKEND_TIMEOUT, "REQUEST_TIMEOUT"); goto cleanup; }
        if ((prefix && *length != AST_HEADER_BYTES) || (!prefix && response_length && *length != response_length)) {
            result = fail(AST_BACKEND_HTTP, "TRUNCATED_RESPONSE"); goto cleanup;
        }
        if (remote_size) *remote_size = total;
        if (final_url) memcpy(final_url, current, strlen(current) + 1);
        result = 0;
cleanup:
        if (request >= 0) { api.request_abort(request); api.request_delete(request); }
        if (connection >= 0) api.connection_delete(connection);
        if (template_id >= 0) api.template_delete(template_id);
        if (result || !next[0]) return result;
        memcpy(current, next, strlen(next) + 1);
    }
    return fail(AST_BACKEND_REDIRECT, "TOO_MANY_REDIRECTS");
}

int ast_http_get(const char *url, unsigned char *out, size_t cap, size_t *length, int *http_status) {
    clear_error();
    return get_remote(url, out, cap, length, http_status, 0, NULL, NULL);
}

static uint32_t big32(const unsigned char *p) {
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
}
static uint64_t big64(const unsigned char *p) {
    return (uint64_t)big32(p) << 32 | big32(p + 4);
}

static int valid_title(const char *title) {
    if (!title || bounded_length(title, 10) != 9) return 0;
    for (int i = 0; i < 4; ++i) if (!ascii_upper((unsigned char)title[i])) return 0;
    for (int i = 4; i < 9; ++i) if (!ascii_digit((unsigned char)title[i])) return 0;
    /* PPSA/NPXS identify PS5/system content, never a user PS4 application. */
    return strncmp(title, "PPSA", 4) && strncmp(title, "NPXS", 4);
}

static int package_info(const unsigned char *header, size_t length, uint64_t remote_size, PackageInfo *out) {
    if (!header || length != AST_HEADER_BYTES || big32(header) != 0x7f434e54U)
        return fail(AST_BACKEND_PACKAGE, "INVALID_PS4_PACKAGE_HEADER");
    const unsigned char *id = header + 0x40;
    if (!ascii_upper(id[0]) || !ascii_upper(id[1]) || id[6] != '-' || id[16] != '_' || id[19] != '-')
        return fail(AST_BACKEND_PACKAGE, "INVALID_PACKAGE_CONTENT_ID");
    for (int i = 2; i < 6; ++i) if (!ascii_digit(id[i])) return fail(AST_BACKEND_PACKAGE, "INVALID_PACKAGE_CONTENT_ID");
    for (int i = 17; i < 19; ++i) if (!ascii_digit(id[i])) return fail(AST_BACKEND_PACKAGE, "INVALID_PACKAGE_CONTENT_ID");
    for (int i = 20; i < 36; ++i)
        if (!ascii_upper(id[i]) && !ascii_digit(id[i]) && id[i] != '_')
            return fail(AST_BACKEND_PACKAGE, "INVALID_PACKAGE_CONTENT_ID");
    memcpy(out->content_id, id, 36); out->content_id[36] = 0;
    memcpy(out->title_id, id + 7, 9); out->title_id[9] = 0;
    if (!valid_title(out->title_id)) return fail(AST_BACKEND_PACKAGE, "UNSUPPORTED_PACKAGE_TITLE_ID");
    /* Free applications/games use base PS4 packages. Patches/DLC need separate
     * version/entitlement handling and are not misreported as installations. */
    if (big32(header + 0x74) != 0x1aU || (big32(header + 0x78) & 0x60100000U))
        return fail(AST_BACKEND_PACKAGE_KIND, "UNSUPPORTED_PACKAGE_KIND: PS4 base packages only");
    out->size = big64(header + 0x430);
    if (out->size < AST_HEADER_BYTES || out->size > AST_PACKAGE_MAX)
        return fail(AST_BACKEND_PACKAGE, "INVALID_PACKAGE_SIZE");
    if (!remote_size || remote_size != out->size)
        return fail(AST_BACKEND_SIZE, "SOURCE_PACKAGE_SIZE_MISMATCH");
    return 0;
}

static int inspect_remote(const char *url, PackageInfo *info, char final_url[AST_URL_MAX]) {
    unsigned char header[AST_HEADER_BYTES];
    size_t length = 0;
    int status = 0;
    uint64_t remote_size = 0;
    int result = get_remote(url, header, sizeof(header), &length, &status, 1, final_url, &remote_size);
    return result ? result : package_info(header, length, remote_size, info);
}

int ast_inspect(const char *url, char title_id[10], uint64_t *size) {
    clear_error();
    if (!title_id || !size) return fail(AST_BACKEND_ARGUMENT, "INVALID_ARGUMENT");
    title_id[0] = 0; *size = 0;
    PackageInfo info;
    int result = inspect_remote(url, &info, NULL);
    if (!result) { memcpy(title_id, info.title_id, 10); *size = info.size; }
    return result;
}

static OwnedTask *owned_task(int task_id) {
    for (size_t i = 0; i < AST_TASK_MAX; ++i)
        if (tasks[i].used && tasks[i].id == task_id) return &tasks[i];
    return NULL;
}

int ast_restore_task(int task_id, const char *title_id, uint64_t expected_size) {
    clear_error();
    if (task_id < 0 || !valid_title(title_id) || expected_size < AST_HEADER_BYTES || expected_size > AST_PACKAGE_MAX)
        return fail(AST_BACKEND_ARGUMENT, "INVALID_OWNED_TASK_RECORD");
    OwnedTask *task = owned_task(task_id);
    if (task) {
        if (strcmp(task->title_id, title_id) || task->size != expected_size)
            return fail(AST_BACKEND_ARGUMENT, "OWNED_TASK_IDENTITY_CONFLICT");
        return 0;
    }
    for (size_t i = 0; i < AST_TASK_MAX; ++i) {
        if (!tasks[i].used) {
            tasks[i].used = 1; tasks[i].id = task_id; tasks[i].size = expected_size;
            memcpy(tasks[i].title_id, title_id, 10);
            return 0;
        }
    }
    return fail(AST_BACKEND_CAPACITY, "OWNED_TASK_CAPACITY_REACHED");
}

int ast_install(const char *url, const char *name, const char *expected_title_id,
                uint64_t expected_size, int *task_id) {
    clear_error();
    if (task_id) *task_id = -1;
    if (!url || !name || !task_id || !valid_title(expected_title_id) ||
        !name[0] || bounded_length(name, 601) > 600 ||
        expected_size < AST_HEADER_BYTES || expected_size > AST_PACKAGE_MAX)
        return fail(AST_BACKEND_ARGUMENT, "INVALID_INSTALL_METADATA");
    for (const unsigned char *p = (const unsigned char *)name; *p; ++p)
        if (*p < 32 || *p == 127) return fail(AST_BACKEND_ARGUMENT, "INVALID_PACKAGE_NAME");
    int has_slot = 0;
    for (size_t i = 0; i < AST_TASK_MAX; ++i) if (!tasks[i].used) { has_slot = 1; break; }
    if (!has_slot) return fail(AST_BACKEND_CAPACITY, "OWNED_TASK_CAPACITY_REACHED");
    PackageInfo info;
    char final_url[AST_URL_MAX];
    int result = inspect_remote(url, &info, final_url);
    if (result) return result;
    if (strcmp(info.title_id, expected_title_id)) return fail(AST_BACKEND_TITLE, "PACKAGE_TITLE_MISMATCH");
    if (info.size != expected_size) return fail(AST_BACKEND_SIZE, "PACKAGE_SIZE_MISMATCH");
    result = init_installer();
    if (result) return result;
    int exists = 0;
    result = api.app_exists(info.title_id, &exists);
    if (result < 0) return fail(AST_BACKEND_SERVICE, "INSTALLED_TITLE_CHECK_FAILED: 0x%08X", (unsigned)result);
    if (exists) return fail(AST_BACKEND_ALREADY_INSTALLED, "ALREADY_INSTALLED: existing application kept");
    int user = -1;
    result = api.initial_user(&user);
    if (result < 0) {
        /* User-service initialization belongs to this process; never borrow
         * another application's initialized runtime. */
        struct { int32_t priority; } parameters = {256};
        result = api.user_init(&parameters);
        if (result < 0) return fail(AST_BACKEND_SERVICE, "USER_SERVICE_INIT_FAILED: 0x%08X", (unsigned)result);
        result = api.initial_user(&user);
    }
    if (result < 0 || user < 0) return fail(AST_BACKEND_SERVICE, "USER_UNAVAILABLE: 0x%08X", (unsigned)result);
    BgftDownload parameters;
    memset(&parameters, 0, sizeof(parameters));
    parameters.user_id = user;
    parameters.entitlement_type = 5;
    parameters.id = info.content_id;
    parameters.url = final_url;
    parameters.extra_url = "";
    parameters.name = name;
    parameters.icon = "";
    parameters.sku = "";
    parameters.options = 0x10000; /* Keep signed GitHub query unchanged. */
    parameters.scenario = "0";
    parameters.release_date = "";
    parameters.package_type = "";
    parameters.package_subtype = "";
    parameters.package_size = info.size;
    int registered = -1;
    result = api.bgft_register(&parameters, &registered);
    if (result < 0 || registered < 0) {
        if ((uint32_t)result == 0x80990088U)
            return fail(AST_BACKEND_ALREADY_INSTALLED, "ALREADY_INSTALLED: existing application kept");
        return fail(AST_BACKEND_REGISTER, "INSTALL_REGISTRATION_FAILED: 0x%08X", (unsigned)result);
    }
    /* Persist the ID even if StartTask fails: it is our registration, not a
     * completed installation. No cancellation/uninstall API is invoked. */
    *task_id = registered;
    result = ast_restore_task(registered, info.title_id, info.size);
    if (result) return result;
    result = api.bgft_start(registered);
    if (result < 0) return fail(AST_BACKEND_START, "INSTALL_START_FAILED: task=%d error=0x%08X", registered, (unsigned)result);
    clear_error();
    return 0;
}

int ast_progress(int task_id, AstProgress *out) {
    clear_error();
    if (!out) return fail(AST_BACKEND_ARGUMENT, "INVALID_ARGUMENT");
    memset(out, 0, sizeof(*out));
    out->preparing = out->copying = -1;
    OwnedTask *task = owned_task(task_id);
    if (!task) return fail(AST_BACKEND_UNKNOWN_TASK, "UNKNOWN_OWNED_TASK");
    out->total = task->size;
    if (task->installed) {
        out->transferred = task->size;
        out->preparing = out->copying = 100;
        out->installed = 1;
        return 0;
    }
    int result = init_installer();
    if (result) return result;
    BgftProgress native;
    memset(&native, 0, sizeof(native));
    native.preparing = native.copying = -1;
    result = api.bgft_progress(task_id, &native);
    if (result < 0) {
        out->error = result;
        return fail(AST_BACKEND_PROGRESS, "TASK_PROGRESS_UNAVAILABLE: 0x%08X", (unsigned)result);
    }
    out->total = native.length_total ? native.length_total : native.length;
    out->transferred = native.length_total ? native.transferred_total : native.transferred;
    out->error = native.error;
    out->preparing = native.preparing >= 0 && native.preparing <= 100 ? native.preparing : -1;
    out->copying = native.copying >= 0 && native.copying <= 100 ? native.copying : -1;
    /* Registration and 100% download alone do not prove installation. */
    if (!out->error && out->total == task->size && out->transferred == out->total &&
        out->preparing == 100 && out->copying == 100) {
        int exists = 0;
        result = api.app_exists(task->title_id, &exists);
        if (result < 0) return fail(AST_BACKEND_PROGRESS, "INSTALL_CONFIRMATION_FAILED: 0x%08X", (unsigned)result);
        if (exists) { task->installed = 1; out->installed = 1; }
    }
    return 0;
}
