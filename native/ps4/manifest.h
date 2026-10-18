#ifndef ASTORA_MANIFEST_H
#define ASTORA_MANIFEST_H
#include <stddef.h>
#include <stdint.h>
int ast_manifest_publish(const char *url, const char *digest, uint64_t size,
                         char *local_url, size_t capacity);
#endif
