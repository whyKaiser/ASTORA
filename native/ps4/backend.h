#ifndef ASTORA_PS4_BACKEND_H
#define ASTORA_PS4_BACKEND_H

#include <stddef.h>
#include <stdint.h>

/* This adapter is serialized by the native application's request worker.
 * Error text remains valid until the next backend call. Return codes are stable.
 * The first native release accepts reviewed GitHub HTTPS hosts only. */
enum AstBackendError {
    AST_BACKEND_OK = 0,
    AST_BACKEND_ARGUMENT = 1,
    AST_BACKEND_NOT_READY = 2,
    AST_BACKEND_MODULE = 3,
    AST_BACKEND_NETWORK = 4,
    AST_BACKEND_DNS = 5,
    AST_BACKEND_URL = 6,
    AST_BACKEND_UNSUPPORTED_HOST = 7,
    AST_BACKEND_TLS = 8,
    AST_BACKEND_HTTP = 9,
    AST_BACKEND_LIMIT = 10,
    AST_BACKEND_REDIRECT = 11,
    AST_BACKEND_TIMEOUT = 12,
    AST_BACKEND_PACKAGE = 13,
    AST_BACKEND_TITLE = 14,
    AST_BACKEND_SIZE = 15,
    AST_BACKEND_PACKAGE_KIND = 16,
    AST_BACKEND_SERVICE = 17,
    AST_BACKEND_ALREADY_INSTALLED = 18,
    AST_BACKEND_REGISTER = 19,
    AST_BACKEND_CAPACITY = 20,
    AST_BACKEND_START = 21,
    AST_BACKEND_PROGRESS = 22,
    AST_BACKEND_UNKNOWN_TASK = 23,
    AST_BACKEND_PRIVATE_ADDRESS = 24
};

typedef struct AstProgress {
    uint64_t transferred;
    uint64_t total;
    int error;
    int preparing; /* Actual 0..100 percentage, or -1 when unavailable. */
    int copying;   /* Actual 0..100 percentage, or -1 when unavailable. */
    int installed;
} AstProgress;

int ast_backend_init(void);
int ast_http_get(const char *url, unsigned char *out, size_t cap,
                 size_t *length, int *http_status);
int ast_inspect(const char *url, char title_id[10], uint64_t *size);
int ast_install(const char *url, const char *name, const char *expected_title_id,
                uint64_t expected_size, int *task_id);
int ast_progress(int task_id, AstProgress *out);

/* Restore only task IDs previously registered by ASTORA, from trusted local
 * state. A disappeared system task is not proof of completed installation.
 * Keep confirmed completion in the application's persistent job records. */
int ast_restore_task(int task_id, const char *title_id, uint64_t expected_size);
const char *ast_backend_error(void);

#endif
