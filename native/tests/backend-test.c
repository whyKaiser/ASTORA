/* Native-independent contract tests; no real network or PS4 mutations. */
#define AST_BACKEND_HOST_TEST 1
#include "../ps4/backend.c"
#include <assert.h>

static uint64_t clock_value;
uint64_t ast_test_clock(void) { clock_value += 1000; return clock_value; }

typedef struct {
    int status;
    const char *headers;
    const unsigned char *body;
    size_t length, offset;
} MockResponse;

static MockResponse responses[8];
static unsigned response_count, current_response, connections;
static int dns_private, tls_result, native_send_result, slow_read;
static int app_exists_value, start_result, register_result, registration_count;
static unsigned tls_flags, range_headers, closed_requests;
static char connected_urls[8][AST_URL_MAX], registered_url[AST_URL_MAX];
static BgftProgress mocked_progress;
static int progress_result;

static int mock_simple(int id) { (void)id; return 0; }
static int mock_resolver(const char *name, int id, int flags) {
    (void)name; (void)id; (void)flags; return 17;
}
static int mock_resolve(int id, const char *name, void *address, int timeout, int retry, int flags) {
    (void)id; (void)name; (void)retry; (void)flags;
    assert(timeout > 0 && timeout <= 3000000);
    const unsigned char public_address[4] = {140, 82, 112, 3};
    const unsigned char private_address[4] = {127, 0, 0, 1};
    memcpy(address, dns_private ? private_address : public_address, 4);
    return 0;
}
static int mock_template(int context, const char *agent, int version, int auto_proxy) {
    (void)context; (void)agent;
    assert(version == 2 && auto_proxy == 0);
    return 10;
}
static int mock_policy(int id, int value) { (void)id; assert(value == 0); return 0; }
static int mock_proxy(int id, int http_config, int wlan_config, const char *host, uint16_t port) {
    (void)id; assert(http_config == 0 && wlan_config == 0 && !host && !port); return 0;
}
static int mock_timeout(int id, uint32_t value) { (void)id; assert(value > 0 && value <= 5000000); return 0; }
static int mock_header_max(int id, uint64_t value) { (void)id; assert(value == 16384); return 0; }
static int mock_tls(int id, uint32_t flags) { (void)id; tls_flags = flags; return tls_result; }
static int mock_connection(int id, const char *url, int keep_alive) {
    (void)id; assert(!keep_alive);
    assert(connections < response_count);
    memcpy(connected_urls[connections], url, strlen(url) + 1);
    current_response = connections++;
    return 11;
}
static int mock_request(int id, int method, const char *url, uint64_t length) {
    (void)id; assert(method == 0 && !length);
    assert(!strcmp(url, connected_urls[current_response]));
    return 12;
}
static int mock_delete_request(int id) { (void)id; ++closed_requests; return 0; }
static int mock_add_header(int id, const char *name, const char *value, int mode) {
    (void)id; assert(mode == 0);
    if (!strcmp(name, "Range")) { assert(!strcmp(value, "bytes=0-8191")); ++range_headers; }
    else { assert(!strcmp(name, "Accept-Encoding") && !strcmp(value, "identity")); }
    return 0;
}
static int mock_send(int id, const void *data, size_t length) {
    (void)id; assert(!data && !length); return native_send_result;
}
static int mock_status(int id, int *status) { (void)id; *status = responses[current_response].status; return 0; }
static int mock_headers(int id, char **headers, size_t *length) {
    (void)id; *headers = (char *)responses[current_response].headers; *length = strlen(*headers); return 0;
}
static int mock_read(int id, void *out, uint64_t wanted) {
    (void)id;
    if (slow_read) clock_value += AST_DEADLINE_US;
    MockResponse *response = &responses[current_response];
    size_t count = response->length - response->offset;
    if (count > wanted) count = (size_t)wanted;
    if (count) memcpy(out, response->body + response->offset, count);
    response->offset += count;
    return (int)count;
}
static int mock_exists(const char *title, int *exists) {
    assert(!strcmp(title, "ASTR00001")); *exists = app_exists_value; return 0;
}
static int mock_user(int *id) { *id = 42; return 0; }
static int mock_register(BgftDownload *parameters, int *task_id) {
    ++registration_count;
    assert(parameters->user_id == 42 && parameters->entitlement_type == 5);
    assert(!strcmp(parameters->id, "IV0000-ASTR00001_00-ASTORATEST000001"));
    assert(parameters->options == 0x10000 && parameters->package_size == 229376);
    strcpy(registered_url, parameters->url);
    *task_id = register_result ? -1 : 73;
    return register_result;
}
static int mock_start(int task_id) { assert(task_id == 73); return start_result; }
static int mock_progress(int task_id, BgftProgress *out) {
    assert(task_id == 73); *out = mocked_progress; return progress_result;
}

static void reset(void) {
    memset(&api, 0, sizeof(api));
    memset(tasks, 0, sizeof(tasks));
    memset(responses, 0, sizeof(responses));
    memset(connected_urls, 0, sizeof(connected_urls));
    memset(&mocked_progress, 0, sizeof(mocked_progress));
    registered_url[0] = 0;
    clock_value = 0; response_count = current_response = connections = 0;
    dns_private = tls_result = native_send_result = slow_read = 0;
    app_exists_value = start_result = register_result = registration_count = 0;
    tls_flags = range_headers = closed_requests = 0;
    progress_result = 0;
    ready = installer_ready = 1;
    pool = 1; ssl = 2; http = 3;
    api.resolver_create = mock_resolver; api.resolver_destroy = mock_simple; api.resolve = mock_resolve;
    api.template_create = mock_template; api.template_delete = mock_simple;
    api.connection_create = mock_connection; api.connection_delete = mock_simple;
    api.request_create = mock_request; api.request_delete = mock_delete_request; api.request_abort = mock_simple;
    api.set_redirect = api.set_cookie = api.set_auth = api.set_resolve_retry = mock_policy;
    api.set_proxy = mock_proxy;
    api.set_resolve_timeout = api.set_connect_timeout = api.set_send_timeout = api.set_recv_timeout = mock_timeout;
    api.set_header_max = mock_header_max; api.tls_enable = mock_tls;
    api.add_header = mock_add_header; api.send = mock_send; api.read = mock_read;
    api.status = mock_status; api.headers = mock_headers;
    api.app_exists = mock_exists; api.initial_user = mock_user;
    api.bgft_register = mock_register; api.bgft_start = mock_start; api.bgft_progress = mock_progress;
}

static void response(int status, const char *headers, const unsigned char *body, size_t length) {
    responses[response_count++] = (MockResponse){status, headers, body, length, 0};
}
static void put32(unsigned char *p, uint32_t n) {
    p[0] = (unsigned char)(n >> 24); p[1] = (unsigned char)(n >> 16);
    p[2] = (unsigned char)(n >> 8); p[3] = (unsigned char)n;
}
static void package(unsigned char out[AST_HEADER_BYTES]) {
    memset(out, 0, AST_HEADER_BYTES);
    put32(out, 0x7f434e54);
    memcpy(out + 0x40, "IV0000-ASTR00001_00-ASTORATEST000001", 36);
    put32(out + 0x74, 0x1a);
    put32(out + 0x434, 229376);
}
static const char *package_headers = "Content-Length: 8192\r\nContent-Range: bytes 0-8191/229376\r\n";

static void test_boundaries(void) {
    ParsedUrl parsed;
    assert(!parse_url("https://github.com/a/b/releases/download/v1/a.pkg?x=a%2Fb", &parsed));
    assert(!parse_url("https://RAW.GITHUBUSERCONTENT.COM:443/a/b", &parsed));
    const char *invalid[] = {
        "http://github.com/a", "https://127.0.0.1/a", "https://[::1]/a",
        "https://github.com.evil.test/a", "https://github.com@evil.test/a",
        "https://evil.test@github.com/a", "https://github.com:80/a",
        "https://github.com/a%0d%0aHost:evil", "https://github.com/a\\b",
        "https://github.com./a", "https://github.com/a#b", "https://github.com/%zz"
    };
    for (size_t i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) assert(parse_url(invalid[i], &parsed));
    unsigned char public_address[4] = {140, 82, 112, 3};
    assert(public_ipv4(public_address));
    const unsigned char invalid_ips[][4] = {{0,1,2,3},{10,1,2,3},{127,0,0,1},{100,64,0,1},{169,254,1,1},
        {172,16,0,1},{192,168,1,1},{192,0,2,1},{198,18,1,1},{198,51,100,1},{203,0,113,1},{224,1,1,1},{255,255,255,255}};
    for (size_t i = 0; i < sizeof(invalid_ips) / sizeof(invalid_ips[0]); ++i) assert(!public_ipv4(invalid_ips[i]));
}

static void test_transport(void) {
    unsigned char out[16]; size_t length; int status;
    reset();
    response(302, "Location: https://release-assets.githubusercontent.com/a.pkg?sig=a%2Fb%3D\r\n", NULL, 0);
    response(200, "Content-Length: 2\r\n", (const unsigned char *)"{}", 2);
    assert(!ast_http_get("https://github.com/release", out, sizeof(out), &length, &status));
    assert(length == 2 && status == 200 && tls_flags == 0x3d && closed_requests == 2);
    assert(!strcmp(connected_urls[1], "https://release-assets.githubusercontent.com/a.pkg?sig=a%2Fb%3D"));
    reset();
    response(302, "Location: http://github.com/a\r\n", NULL, 0);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_TLS);
    assert(connections == 1);
    reset();
    response(302, "Location: https://127.0.0.1/a\r\n", NULL, 0);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status));
    assert(connections == 1);
    reset(); dns_private = 1;
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_PRIVATE_ADDRESS);
    assert(connections == 0);
    reset(); tls_result = -1;
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_TLS);
    assert(connections == 0);
    reset();
    response(200, "Content-Length: 17\r\n", (const unsigned char *)"01234567890123456", 17);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_LIMIT);
    reset();
    response(200, "", (const unsigned char *)"01234567890123456", 17);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_LIMIT);
    reset();
    response(200, "Content-Length: 3\r\n", (const unsigned char *)"{}", 2);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_HTTP);
    reset();
    response(302, "Location: /a\r\nLocation: /b\r\n", NULL, 0);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_REDIRECT);
    reset();
    for (unsigned i = 0; i < 6; ++i) response(302, "Location: /again\r\n", NULL, 0);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_REDIRECT);
    assert(connections == 6 && closed_requests == 6);
    reset(); slow_read = 1;
    response(200, "Content-Length: 2\r\n", (const unsigned char *)"{}", 2);
    assert(ast_http_get("https://github.com/a", out, sizeof(out), &length, &status) == AST_BACKEND_TIMEOUT);
}

static void test_packages_and_installation(void) {
    unsigned char header[AST_HEADER_BYTES]; PackageInfo info;
    package(header);
    assert(!package_info(header, sizeof(header), 229376, &info));
    assert(!strcmp(info.title_id, "ASTR00001") && info.size == 229376);
    assert(package_info(header, sizeof(header), 1, &info) == AST_BACKEND_SIZE);
    put32(header + 0x74, 0x1e);
    assert(package_info(header, sizeof(header), 229376, &info) == AST_BACKEND_PACKAGE_KIND);
    package(header); memcpy(header + 0x47, "PPSA00001", 9);
    assert(package_info(header, sizeof(header), 229376, &info) == AST_BACKEND_PACKAGE);
    package(header); header[0] = 0;
    assert(package_info(header, sizeof(header), 229376, &info) == AST_BACKEND_PACKAGE);
    package(header);
    reset();
    response(206, package_headers, header, sizeof(header));
    char title[10]; uint64_t size = 0;
    assert(!ast_inspect("https://github.com/a.pkg", title, &size));
    assert(!strcmp(title, "ASTR00001") && size == 229376 && range_headers == 1);
    reset();
    response(206, "Content-Length: 8192\r\nContent-Range: bytes 1-8192/229376\r\n", header, sizeof(header));
    assert(ast_inspect("https://github.com/a.pkg", title, &size) == AST_BACKEND_HTTP);
    reset();
    response(206, package_headers, header, sizeof(header));
    int task_id = -1;
    assert(ast_install("https://github.com/a.pkg", "Example", "ASTR00002", 229376, &task_id) == AST_BACKEND_TITLE);
    assert(registration_count == 0 && task_id == -1);
    reset(); app_exists_value = 1;
    response(206, package_headers, header, sizeof(header));
    assert(ast_install("https://github.com/a.pkg", "Example", "ASTR00001", 229376, &task_id) == AST_BACKEND_ALREADY_INSTALLED);
    assert(registration_count == 0 && task_id == -1);
    reset();
    response(302, "Location: https://release-assets.githubusercontent.com/a.pkg?sig=keep%2Fme\r\n", NULL, 0);
    response(206, package_headers, header, sizeof(header));
    assert(!ast_install("https://github.com/a.pkg", "Example", "ASTR00001", 229376, &task_id));
    assert(task_id == 73 && range_headers == 2 && registration_count == 1);
    assert(!strcmp(registered_url, "https://release-assets.githubusercontent.com/a.pkg?sig=keep%2Fme"));
    AstProgress progress;
    assert(!ast_progress(task_id, &progress) && !progress.installed);
    mocked_progress.length_total = mocked_progress.transferred_total = 229376;
    mocked_progress.preparing = 100; mocked_progress.copying = 99; app_exists_value = 1;
    assert(!ast_progress(task_id, &progress) && !progress.installed);
    mocked_progress.copying = 100; app_exists_value = 0;
    assert(!ast_progress(task_id, &progress) && !progress.installed);
    app_exists_value = 1;
    assert(!ast_progress(task_id, &progress) && progress.installed);
    reset(); start_result = -3;
    response(206, package_headers, header, sizeof(header));
    assert(ast_install("https://github.com/a.pkg", "Example", "ASTR00001", 229376, &task_id) == AST_BACKEND_START);
    assert(task_id == 73 && owned_task(73) && !owned_task(73)->installed);
    reset();
    assert(ast_progress(73, &progress) == AST_BACKEND_UNKNOWN_TASK);
    assert(!ast_restore_task(73, "ASTR00001", 229376));
    progress_result = (int)0x80990019U; app_exists_value = 1;
    assert(ast_progress(73, &progress) == AST_BACKEND_PROGRESS && !progress.installed);
    assert(ast_restore_task(73, "ASTR00002", 229376) == AST_BACKEND_ARGUMENT);
}

int main(void) {
    test_boundaries();
    test_transport();
    test_packages_and_installation();
    puts("backend: URL/DNS/TLS/redirect/body bounds, PKG identity, owned tasks and truthful installation progress passed");
    return 0;
}
