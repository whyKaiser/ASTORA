/* Test doubles verify adapter decisions; not a substitute for PS4 execution. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../ps4/browser.c"

static int module_loaded;
static int module_calls;
static int initialize_calls;
static int terminate_calls;
static int open_calls;
static int reject_custom;
static int reject_default;
static int current_status = ORBIS_COMMON_DIALOG_STATUS_RUNNING;
static int32_t common_result;
static int32_t user_result;
static int32_t init_result;

int32_t sceSysmoduleIsLoaded(int module) { assert(module == 0xab); return module_loaded ? 0 : -1; }
int32_t sceSysmoduleLoadModule(int module) { assert(module == 0xab); module_loaded = 1; module_calls++; return 0; }
uint32_t sceSysmoduleLoadModuleInternal(uint32_t module) { assert(module == ORBIS_SYSMODULE_INTERNAL_USER_SERVICE); return 0; }
int32_t sceUserServiceInitialize(void *p) { assert(p == NULL); return user_result; }
int32_t sceUserServiceGetInitialUser(int32_t *user) { *user = 0x10000001; return 0; }
int32_t sceCommonDialogInitialize(void) { return common_result; }
int32_t sceWebBrowserDialogInitialize(void) { initialize_calls++; return init_result; }
int32_t sceWebBrowserDialogOpen(const AstBrowserParam *param)
{
    open_calls++;
    assert(param->size == 328);
    assert(param->base.size == 48);
    assert(param->base.magic == (uint32_t)(ORBIS_COMMON_DIALOG_MAGIC_NUMBER + (uintptr_t)param));
    assert(param->user_id == 0x10000001);
    assert(strcmp(param->url, "http://127.0.0.1:12840/") == 0);
    assert(param->callback == NULL && param->ime == NULL && param->webview == NULL);
    if (param->mode == 2) {
        assert(param->width == 1920 && param->height == 1080);
        assert(param->control == 0x1f);
        return reject_custom ? (int32_t)UINT32_C(0x80b8000a) : 0;
    }
    assert(param->mode == 1 && param->width == 0 && param->height == 0);
    assert(param->control == 0);
    return reject_default ? (int32_t)UINT32_C(0x80b8000f) : 0;
}
int32_t sceWebBrowserDialogUpdateStatus(void) { return current_status; }
int32_t sceWebBrowserDialogTerminate(void) { terminate_calls++; return 0; }

static void close_and_check(void)
{
    int count = terminate_calls;
    current_status = ORBIS_COMMON_DIALOG_STATUS_FINISHED;
    ast_browser_tick();
    assert(terminate_calls == count + 1);
    assert(!ast_browser_running());
    assert(strcmp(ast_browser_error(), "Browser dialog closed") == 0);
    ast_browser_tick();
    assert(terminate_calls == count + 1);
    current_status = ORBIS_COMMON_DIALOG_STATUS_RUNNING;
}

int main(void)
{
    assert(ast_browser_open(NULL) == -1);
    assert(ast_browser_open("https://example.com/") == -1);
    assert(ast_browser_open("http://127.0.0.1:12840@example.com/") == -1);
    assert(ast_browser_open("http://127.0.0.1:99999/") == -1);
    assert(ast_browser_open("http://127.0.0.1:0/") == -1);
    assert(initialize_calls == 0 && module_calls == 0);

    assert(ast_browser_open("http://127.0.0.1:12840/") == 0);
    assert(ast_browser_running());
    assert(*ast_browser_error() == '\0' && module_calls == 1);
    ast_browser_tick();
    assert(terminate_calls == 0);
    assert(ast_browser_open("http://127.0.0.1:12840/") == -1);
    close_and_check();

    reject_custom = 1;
    user_result = (int32_t)ORBIS_USER_SERVICE_ERROR_ALREADY_INITIALIZED;
    common_result = (int32_t)AST_COMMON_ALREADY_INITIALIZED;
    assert(ast_browser_open("http://127.0.0.1:12840/") == 0);
    assert(module_calls == 1 && open_calls == 3);
    close_and_check();

    reject_default = 1;
    assert(ast_browser_open("http://127.0.0.1:12840/") == -1);
    assert(strstr(ast_browser_error(), "custom 0x80b8000a; default 0x80b8000f"));
    assert(terminate_calls == 3);
    ast_browser_tick();
    assert(terminate_calls == 3);

    init_result = (int32_t)UINT32_C(0x80b80008);
    assert(ast_browser_open("http://127.0.0.1:12840/") == -1);
    assert(strstr(ast_browser_error(), "Initialize WebBrowserDialog: 0x80b80008"));
    assert(terminate_calls == 3);
    puts("Browser lifecycle checks passed (host test doubles; no console execution).");
    return 0;
}
