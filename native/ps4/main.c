#include "backend.h"
#include "browser.h"
#include "server.h"
#include <orbis/libkernel.h>
#include <orbis/SystemService.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
static void startup_error(const char *detail) {
  OrbisNotificationRequest notification;
  memset(&notification, 0, sizeof(notification));
  notification.targetId = -1;
  snprintf(notification.message, sizeof(notification.message),
           "ASTORA could not start: %.200s\nLog: /data/ASTORA/native-status.log", detail);
  sceKernelSendNotificationRequest(0, &notification, sizeof(notification), 0);
}
/* Independent OpenOrbis process; never loads Nova, DiPlay or a title plugin. */
int main(void) {
  mkdir("/data/ASTORA", 0777);
  ast_log("astora_boot_0.4.0", 0);
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
  }
  ast_log("hide_splash", sceSystemServiceHideSplashScreen());
  for (;;) {
    ast_browser_tick();
    sceKernelUsleep(16667);
  }
  return 0;
}
