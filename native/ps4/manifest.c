/* A console-only BGFT reference document, not a file relay. Large downloads
 * still go directly from the inspected HTTPS source to the console service.
 * Separate listener avoids deadlocking the UI's synchronous install request.
 * Reference format: flatz/ps4_remote_pkg_installer, pkg.c and pkg.h.
 */
#include "manifest.h"
#include "../vendor/cJSON.h"
#include <netinet/in.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef ASTORA_HOST_TEST
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#define net_socket() socket(AF_INET, SOCK_STREAM, 0)
#define net_recv(s,b,n) recv(s,b,n,0)
#define net_send(s,b,n) send(s,b,n,MSG_NOSIGNAL)
#define net_close(s) close(s)
#else
#include <orbis/Net.h>
#define net_socket() sceNetSocket("astora-manifest", 2, 1, 0)
#define net_recv(s,b,n) sceNetRecv(s,b,n,0)
#define net_send(s,b,n) sceNetSend(s,b,n,0)
#define net_close(s) sceNetSocketClose(s)
#endif
#define MANIFEST_PORT 12841
#define MANIFEST_MAX 128
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static int listener = -1;
static char token[65];
static char *documents[MANIFEST_MAX];
static unsigned count;

static int send_all(int fd, const char *text, size_t length) {
    while (length) {
        int sent = (int)net_send(fd, text, length);
        if (sent <= 0) return -1;
        text += sent; length -= (size_t)sent;
    }
    return 0;
}
static void serve(int fd) {
    char request[2048], method[8], path[128], protocol[16];
    size_t received = 0;
    while (received < sizeof(request) - 1) {
        int n = (int)net_recv(fd, request + received, sizeof(request) - 1 - received);
        if (n <= 0) return;
        received += (size_t)n;
        request[received] = 0;
        if (strstr(request, "\r\n\r\n")) break;
    }
    if (!strstr(request, "\r\n\r\n") ||
        sscanf(request, "%7s %127s %15s", method, path, protocol) != 3) return;
    const char *document = NULL;
    if ((!strcmp(method, "GET") || !strcmp(method, "HEAD")) &&
        (!strcmp(protocol, "HTTP/1.0") || !strcmp(protocol, "HTTP/1.1"))) {
        pthread_mutex_lock(&lock);
        for (unsigned i = 0; i < count; ++i) {
            char expected[128];
            snprintf(expected, sizeof(expected), "/%s-%u.json", token, i);
            if (!strcmp(expected, path)) { document = documents[i]; break; }
        }
        pthread_mutex_unlock(&lock);
    }
    const size_t length = document ? strlen(document) : 0;
    char header[320];
    int n = snprintf(header, sizeof(header),
        "HTTP/1.1 %s\r\nContent-Type: application/json\r\nContent-Length: %zu\r\n"
        "Cache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n",
        document ? "200 OK" : "404 Not Found", length);
    if (!send_all(fd, header, (size_t)n) && document && !strcmp(method, "GET"))
        send_all(fd, document, length);
}
static void *worker(void *unused) {
    (void)unused;
    for (;;) {
        struct sockaddr_in peer;
#ifdef ASTORA_HOST_TEST
        socklen_t length = sizeof(peer);
        int fd = accept(listener, (struct sockaddr *)&peer, &length);
        struct timeval timeout = {5, 0};
        if (fd >= 0) {
            setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
            setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        }
#else
        OrbisNetSocklen_t length = sizeof(peer);
        int fd = sceNetAccept(listener, (OrbisNetSockaddr *)&peer, &length);
        struct { int64_t sec, usec; } timeout = {5, 0};
        if (fd >= 0) {
            sceNetSetsockopt(fd, 0xffff, 0x1006, &timeout, sizeof(timeout));
            sceNetSetsockopt(fd, 0xffff, 0x1005, &timeout, sizeof(timeout));
        }
#endif
        if (fd < 0) continue;
        serve(fd);
        net_close(fd);
    }
    return NULL;
}
static int start(void) {
    if (listener >= 0) return 0;
    unsigned char random[32];
    FILE *source = fopen("/dev/urandom", "rb");
    if (!source) return -1;
    size_t got = fread(random, 1, sizeof(random), source);
    fclose(source);
    if (got != sizeof(random)) return -1;
    for (unsigned i = 0; i < sizeof(random); ++i)
        snprintf(token + i * 2, 3, "%02x", random[i]);
    listener = net_socket();
    if (listener < 0) return -1;
    struct sockaddr_in address = {0};
    int yes = 1, result;
#ifdef ASTORA_HOST_TEST
    address.sin_family = AF_INET;
    address.sin_port = htons(MANIFEST_PORT);
    address.sin_addr.s_addr = htonl(0x7f000001);
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    result = bind(listener, (struct sockaddr *)&address, sizeof(address));
    if (!result) result = listen(listener, 8);
#else
    address.sin_len = sizeof(address);
    address.sin_family = 2;
    address.sin_port = sceNetHtons(MANIFEST_PORT);
    address.sin_addr.s_addr = sceNetHtonl(0x7f000001);
    sceNetSetsockopt(listener, 0xffff, 4, &yes, sizeof(yes));
    result = sceNetBind(listener, (OrbisNetSockaddr *)&address, sizeof(address));
    if (!result) result = sceNetListen(listener, 8);
#endif
    pthread_t thread;
    if (!result) result = pthread_create(&thread, NULL, worker, NULL);
    if (result) { net_close(listener); listener = -1; return -1; }
    pthread_detach(thread);
    return 0;
}
int ast_manifest_publish(const char *url, const char *digest, uint64_t size,
                         char *local_url, size_t capacity) {
    if (!url || strncmp(url, "https://", 8) || strlen(url) > 2047 ||
        !digest || strlen(digest) != 64 || !local_url || capacity < 128 ||
        size < 8192 || size > UINT64_C(1099511627776)) return -1;
    for (unsigned i = 0; i < 64; ++i)
        if (!((digest[i] >= '0' && digest[i] <= '9') ||
              (digest[i] >= 'a' && digest[i] <= 'f'))) return -1;
    for (const unsigned char *p = (const unsigned char *)url; *p; ++p)
        if (*p < 32 || *p == 127) return -1;
    cJSON *root = cJSON_CreateObject(), *pieces = cJSON_CreateArray(), *piece = cJSON_CreateObject();
    if (!root || !pieces || !piece) { cJSON_Delete(root); cJSON_Delete(pieces); cJSON_Delete(piece); return -1; }
    cJSON_AddNumberToObject(root, "originalFileSize", (double)size);
    cJSON_AddStringToObject(root, "packageDigest", digest);
    cJSON_AddNumberToObject(root, "numberOfSplitFiles", 1);
    cJSON_AddItemToObject(root, "pieces", pieces);
    cJSON_AddItemToArray(pieces, piece);
    cJSON_AddStringToObject(piece, "url", url);
    cJSON_AddNumberToObject(piece, "fileOffset", 0);
    cJSON_AddNumberToObject(piece, "fileSize", (double)size);
    cJSON_AddStringToObject(piece, "hashValue", "0000000000000000000000000000000000000000");
    char *document = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!document) return -1;
    pthread_mutex_lock(&lock);
    int result = count >= MANIFEST_MAX ? -1 : start();
    if (!result) {
        documents[count] = document;
        snprintf(local_url, capacity, "http://127.0.0.1:%d/%s-%u.json", MANIFEST_PORT, token, count++);
    } else free(document);
    pthread_mutex_unlock(&lock);
    return result;
}
