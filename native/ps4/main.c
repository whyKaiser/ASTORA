#include "backend.h"
#include "browser.h"
#include "server.h"
#include "privileges.h"
#include <orbis/libkernel.h>
#include <orbis/SystemService.h>
#include <orbis/UserService.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
/* Explicit, one-use local developer request. Never enabled by the package itself;
 * no account activation, network transmission, keys or password reads. */
static void remote_play_diagnostic(void) {
  const char *marker = "/data/ASTORA/.request-remote-play-info";
  struct stat st;
  if (stat(marker, &st) != 0) return;
  remove(marker);
  OrbisUserServiceUserId user_id = -1;
  uint64_t account_id = 0;
  int rc = sceUserServiceGetInitialUser(&user_id);
  if (!rc) rc = sceUserServiceGetNpAccountId(user_id, &account_id);
  FILE *f = fopen("/data/ASTORA/remote-play-info.json", "w");
  if (f) {
    fprintf(f, "{\"result\":%d,\"accountIdHex\":\"%016llX\"}\n",
            rc, (unsigned long long)account_id);
    fclose(f);
  }
  ast_log("remote_play_local_info", rc);
}
static void startup_error(const char *detail) {
  OrbisNotificationRequest notification;
  memset(&notification, 0, sizeof(notification));
  notification.targetId = -1;
  snprintf(notification.message, sizeof(notification.message),
           "ASTORA could not start: %.200s\nLog: /data/ASTORA/native-status.log", detail);
  sceKernelSendNotificationRequest(0, &notification, sizeof(notification), 0);
}
static int finish_application(void) {
  ast_log("privileges_restore", ast_privileges_restore());
  return sceSystemServiceLoadExec("exit", NULL);
}
/* Independent OpenOrbis process; never loads Nova, DiPlay or a title plugin. */
int main(void) {
  mkdir("/data/ASTORA", 0777);
  ast_log("astora_boot_0.6.0", 0);
  int rc = ast_backend_init();
  ast_log("backend_init", rc);
  if (rc) {
    ast_log(ast_backend_error(), rc);
    startup_error(ast_backend_error());
    for (;;)
      sceKernelUsleep(1000000);
  }
  rc =
      ast_server_start("/app0/astora-ui", "/app0/catalog.json", "/data/ASTORA");
  ast_log("server_start", rc);
  if (rc) {
    startup_error("local interface service unavailable");
    for (;;)
      sceKernelUsleep(1000000);
  }
  rc = ast_browser_open("http://127.0.0.1:12840/");
  ast_log("browser_open", rc);
  if (rc) {
    ast_log(ast_browser_error(), rc);
    startup_error(ast_browser_error());
    return finish_application();
  }
  ast_log("hide_splash", sceSystemServiceHideSplashScreen());
  if (!rc) remote_play_diagnostic();
  char last_browser_error[192] = {0};
  for (;;) {
    ast_browser_tick();
    const char *diagnostic = ast_browser_error();
    if (diagnostic[0] && strcmp(last_browser_error, diagnostic)) {
      ast_log(diagnostic, 0);
      snprintf(last_browser_error, sizeof(last_browser_error), "%s", diagnostic);
    }
    if (!ast_browser_running()) {
      ast_log("interface_closed_exit_requested", 0);
      return finish_application();
    }
    sceKernelUsleep(16667);
  }
  return 0;
}
