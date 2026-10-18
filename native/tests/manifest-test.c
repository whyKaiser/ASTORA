#include "../ps4/manifest.h"
#include <assert.h>
#include <stdio.h>
#include <unistd.h>
int main(void) {
    char url[128];
    const char *digest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert(ast_manifest_publish("http://example.com/a", digest, 8192, url, sizeof(url)) < 0);
    assert(ast_manifest_publish("https://example.com/a", "bad", 8192, url, sizeof(url)) < 0);
    assert(ast_manifest_publish("https://release-assets.githubusercontent.com/asset?sig=a%2Fb&name=\"x\"", digest, 229376, url, sizeof(url)) == 0);
    puts(url); fflush(stdout);
    for (;;) sleep(1);
}
