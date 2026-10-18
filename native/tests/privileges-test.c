/* Test failure/rollback contracts without console/kernel access. */
#include <assert.h>
#include <string.h>
#include "../ps4/privileges.c"

static int read_result, prepare_result, apply_result, restore_result;
static int reads, applications, restorations;
int jbc_get_cred(jbc_cred *value) {
    ++reads;
    memset(value, 0, sizeof(*value));
    value->uid = 1000;
    return read_result;
}
int jbc_jailbreak_cred(jbc_cred *value) {
    value->uid = 0;
    return prepare_result;
}
int jbc_set_cred(const jbc_cred *value) {
    if (value->uid == 1000) { ++restorations; return restore_result; }
    ++applications;
    return apply_result;
}
static void reset(void) {
    read_result = prepare_result = apply_result = restore_result = 0;
    reads = applications = restorations = restore_pending = prepared = 0;
}
int main(void) {
    reset();
    read_result = -1;
    assert(ast_privileges_prepare() == -1 && !applications && !restorations);
    reset();
    prepare_result = -1;
    assert(ast_privileges_prepare() == -2 && !applications && !restorations);
    reset();
    apply_result = -1;
    assert(ast_privileges_prepare() == -3 && restorations == 1 && !restore_pending);
    reset();
    apply_result = restore_result = -1;
    assert(ast_privileges_prepare() == -4 && restore_pending);
    assert(ast_privileges_prepare() == -4 && reads == 1 && applications == 1);
    restore_result = 0;
    assert(ast_privileges_restore() == 0 && !restore_pending);
    reset();
    assert(ast_privileges_prepare() == 0 && prepared);
    assert(ast_privileges_prepare() == 0 && reads == 1 && applications == 1);
    assert(ast_privileges_restore() == 0 && restorations == 1 && !prepared);
    assert(ast_privileges_restore() == 0 && restorations == 1);
    return 0;
}
