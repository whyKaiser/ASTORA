/* SPDX-License-Identifier: MIT
 * Original ASTORA browser adapter. Public ABI evidence (not launcher code):
 * https://github.com/s0liton/RommPS/blob/2d42c0578d751988acdd9bfef5c8b286813a249f/platform/ps4/app/launcher.c
 * https://github.com/cualquiercosa327/ArabicGuy-Menu-Base-GoldHEN/blob/5cb921bc9482d51509035768c8ea42fd92d5c19f/include/imports.h
 * OpenOrbis supplies the common-dialog base type, module IDs and import stubs.
 * Do not include its WebBrowserDialog.h: version 0.5.4 declares void-returning,
 * untyped prototypes. This adapter declares the evidenced ABI explicitly.
 */
#include "browser.h"

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <orbis/CommonDialog.h>
#include <orbis/Sysmodule.h>
#include <orbis/UserService.h>

typedef struct AstBrowserParam {
    OrbisCommonDialogBaseParam base;
    uint64_t size;
    int32_t mode;
    int32_t user_id;
    const char *url;
    const void *callback;
    uint16_t width;
    uint16_t height;
    uint16_t x;
    uint16_t y;
    uint32_t parts;
    uint16_t header_width;
    uint16_t header_x;
    uint16_t header_y;
    uint16_t padding0;
    uint32_t control;
    const void *ime;
    const void *webview;
    uint32_t animation;
    uint8_t reserved[202];
    uint16_t padding1;
} AstBrowserParam;

#define AST_OFFSET(field, offset) \
    _Static_assert(offsetof(AstBrowserParam, field) == (offset), "browser ABI: " #field)
_Static_assert(sizeof(void *) == 8, "browser ABI requires 64-bit pointers");
_Static_assert(sizeof(OrbisCommonDialogBaseParam) == 48, "common dialog base ABI");
_Static_assert(offsetof(OrbisCommonDialogBaseParam, magic) == 44, "common dialog magic ABI");
_Static_assert(sizeof(AstBrowserParam) == 328, "browser parameter ABI size");
AST_OFFSET(base, 0);
AST_OFFSET(size, 48);
AST_OFFSET(mode, 56);
AST_OFFSET(user_id, 60);
AST_OFFSET(url, 64);
AST_OFFSET(callback, 72);
AST_OFFSET(width, 80);
AST_OFFSET(height, 82);
AST_OFFSET(x, 84);
AST_OFFSET(y, 86);
AST_OFFSET(parts, 88);
AST_OFFSET(header_width, 92);
AST_OFFSET(header_x, 94);
AST_OFFSET(header_y, 96);
AST_OFFSET(padding0, 98);
AST_OFFSET(control, 100);
AST_OFFSET(ime, 104);
AST_OFFSET(webview, 112);
AST_OFFSET(animation, 120);
AST_OFFSET(reserved, 124);
AST_OFFSET(padding1, 326);
#undef AST_OFFSET

extern int32_t sceWebBrowserDialogInitialize(void);
extern int32_t sceWebBrowserDialogOpen(const AstBrowserParam *param);
extern int32_t sceWebBrowserDialogUpdateStatus(void);
extern int32_t sceWebBrowserDialogTerminate(void);
typedef struct AstBrowserResult {
    int32_t result;
    int32_t padding;
    void *callback;
    uint8_t reserved[240];
} AstBrowserResult;
_Static_assert(sizeof(AstBrowserResult) == 256, "browser result ABI");
extern int32_t sceWebBrowserDialogGetResult(AstBrowserResult *result);

/* Public common-dialog error values, independently documented by shadPS4:
 * src/core/libraries/system/commondialog.h, revision 860a477160e08e65f8c0927677c1955be28fabc7. */
#define AST_COMMON_ALREADY_INITIALIZED UINT32_C(0x80b80002)
#define AST_BROWSER_MODE_DEFAULT 1
#define AST_BROWSER_MODE_CUSTOM 2

/* The base magic incorporates its address; never copy this initialized block.
 * URL storage also outlives every asynchronous browser operation. */
static AstBrowserParam browser_param;
static char browser_url[2048];
static char browser_diagnostic[192];
static int browser_active;
static int browser_initialized;

static int fail(const char *operation, int32_t result)
{
    snprintf(browser_diagnostic, sizeof browser_diagnostic, "%s: 0x%08x",
             operation, (unsigned int)(uint32_t)result);
    return -1;
}

const char *ast_browser_error(void)
{
    return browser_diagnostic;
}

int ast_browser_running(void)
{
    return browser_active;
}

static int is_loopback_url(const char *url)
{
    const char *cursor;
    unsigned int port = 0;
    unsigned int digits = 0;
    if (url == NULL || strncmp(url, "http://127.0.0.1:", 17) != 0) return 0;
    cursor = url + 17;
    while (*cursor >= '0' && *cursor <= '9') {
        if (++digits > 5) return 0;
        port = port * 10 + (unsigned int)(*cursor++ - '0');
    }
    return digits > 0 && port > 0 && port <= 65535 && *cursor == '/';
}

int ast_browser_open(const char *url)
{
    int32_t result;
    int32_t first_open_result;
    int32_t user_id = -1;
    size_t length;

    if (browser_active) {
        snprintf(browser_diagnostic, sizeof browser_diagnostic,
                 "Browser dialog is already active");
        return -1;
    }
    browser_diagnostic[0] = '\0';
    if (!is_loopback_url(url)) {
        snprintf(browser_diagnostic, sizeof browser_diagnostic,
                 "Browser URL must use the console loopback HTTP service");
        return -1;
    }
    length = strlen(url);
    if (length >= sizeof browser_url) {
        snprintf(browser_diagnostic, sizeof browser_diagnostic,
                 "Browser URL exceeds local buffer");
        return -1;
    }
    memcpy(browser_url, url, length + 1);

    /* The public browser module loads its dialog dependencies. Query first so
     * callers that already loaded it are not treated as a failure. */
    if (sceSysmoduleIsLoaded(ORBIS_SYSMODULE_WEB_BROWSER_DIALOG) != 0) {
        result = sceSysmoduleLoadModule(ORBIS_SYSMODULE_WEB_BROWSER_DIALOG);
        if (result < 0) return fail("Load WebBrowserDialog module", result);
    }
    result = (int32_t)sceSysmoduleLoadModuleInternal(ORBIS_SYSMODULE_INTERNAL_USER_SERVICE);
    if (result < 0) return fail("Load UserService module", result);
    result = sceUserServiceInitialize(NULL);
    if (result < 0 && (uint32_t)result != ORBIS_USER_SERVICE_ERROR_ALREADY_INITIALIZED)
        return fail("Initialize UserService", result);
    result = sceUserServiceGetInitialUser(&user_id);
    if (result < 0) return fail("Get initial user", result);
    if (user_id < 0) return fail("No initial user", user_id);
    result = sceCommonDialogInitialize();
    if (result < 0 && (uint32_t)result != AST_COMMON_ALREADY_INITIALIZED)
        return fail("Initialize CommonDialog", result);
    result = sceWebBrowserDialogInitialize();
    if (result < 0) return fail("Initialize WebBrowserDialog", result);
    browser_initialized = 1;

    memset(&browser_param, 0, sizeof browser_param);
    browser_param.base.size = sizeof browser_param.base;
    browser_param.base.magic = (uint32_t)(ORBIS_COMMON_DIALOG_MAGIC_NUMBER +
                                         (uintptr_t)&browser_param.base);
    browser_param.size = sizeof browser_param;
    browser_param.mode = AST_BROWSER_MODE_CUSTOM;
    browser_param.user_id = user_id;
    browser_param.url = browser_url;
    browser_param.width = 1920;
    browser_param.height = 1080;
    browser_param.header_width = 1920;
    /* Enable the browser control mask used by the public PS4 Brew launcher.
     * A zero mask left this console's embedded view without pointer/button
     * input. Button assignment itself comes from the package's ATTRIBUTE. */
    browser_param.control = UINT32_C(0x1f);
    /* Optional callback, IME and web-view parameters stay NULL. Other fields
     * remain zero, matching the minimal public launcher parameter usage. */
    result = sceWebBrowserDialogOpen(&browser_param);
    if (result < 0) {
        first_open_result = result;
        browser_param.mode = AST_BROWSER_MODE_DEFAULT;
        browser_param.width = 0;
        browser_param.height = 0;
        browser_param.header_width = 0;
        browser_param.control = 0;
        result = sceWebBrowserDialogOpen(&browser_param);
        if (result < 0) {
            snprintf(browser_diagnostic, sizeof browser_diagnostic,
                     "Open WebBrowserDialog: custom 0x%08x; default 0x%08x",
                     (unsigned int)(uint32_t)first_open_result,
                     (unsigned int)(uint32_t)result);
            sceWebBrowserDialogTerminate();
            browser_initialized = 0;
            return -1;
        }
    }
    browser_active = 1;
    return 0;
}

void ast_browser_tick(void)
{
    int32_t status;
    int32_t result;
    if (!browser_active) return;
    status = sceWebBrowserDialogUpdateStatus();
    if (status == ORBIS_COMMON_DIALOG_STATUS_RUNNING ||
        status == ORBIS_COMMON_DIALOG_STATUS_INITIALIZED) return;
    browser_active = 0;
    if (status == ORBIS_COMMON_DIALOG_STATUS_FINISHED) {
        AstBrowserResult outcome;
        memset(&outcome, 0, sizeof(outcome));
        int32_t read_result = sceWebBrowserDialogGetResult(&outcome);
        snprintf(browser_diagnostic, sizeof browser_diagnostic,
                 "Browser dialog closed: API 0x%08x result 0x%08x",
                 (unsigned int)(uint32_t)read_result,
                 (unsigned int)(uint32_t)outcome.result);
    } else {
        fail("WebBrowserDialog status", status);
    }
    if (browser_initialized) {
        result = sceWebBrowserDialogTerminate();
        browser_initialized = 0;
        if (result < 0) fail("Terminate WebBrowserDialog", result);
    }
}
