/* Process credential lifecycle for the user's already homebrew-enabled PS4.
 * External dependency: https://github.com/bucanero/ps4-libjbc
 * No new exploit, global patch, account activation or persistent system change.
 */
#include "privileges.h"
#include <libjbc.h>

static jbc_cred original;
static int restore_pending;
static int prepared;

int ast_privileges_restore(void) {
    if (!restore_pending) return 0;
    int result = jbc_set_cred(&original);
    if (!result) {
        restore_pending = 0;
        prepared = 0;
    }
    return result;
}

int ast_privileges_prepare(void) {
    if (prepared) return 0;
    /* A failed partial application must be restored before any retry. */
    if (restore_pending && ast_privileges_restore()) return -4;
    if (jbc_get_cred(&original)) return -1;
    jbc_cred elevated = original;
    if (jbc_jailbreak_cred(&elevated)) return -2;
    restore_pending = 1;
    if (jbc_set_cred(&elevated)) {
        return ast_privileges_restore() ? -4 : -3;
    }
    prepared = 1;
    return 0;
}
