/* SPDX-License-Identifier: MIT */
#ifndef ASTORA_PS4_BROWSER_H
#define ASTORA_PS4_BROWSER_H

/* Call on the application thread, after its loopback HTTP service is ready.
 * Returns 0 once the system accepted the dialog, -1 on failure. Acceptance
 * does not prove that the web document has loaded or rendered correctly. */
int ast_browser_open(const char *url);

/* Poll from the application loop, approximately once per frame. A user-closed
 * dialog stays closed; this function never starts a reopen loop. */
void ast_browser_tick(void);

/* Process-local diagnostic; empty while the last operation is successful.
 * No log file is written by this module. All calls use the same thread. */
const char *ast_browser_error(void);

#endif
