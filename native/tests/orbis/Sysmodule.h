#pragma once
#include <stdint.h>
enum { ORBIS_SYSMODULE_WEB_BROWSER_DIALOG = 0x00ab };
#define ORBIS_SYSMODULE_INTERNAL_USER_SERVICE UINT32_C(0x80000011)
int32_t sceSysmoduleIsLoaded(int module);
int32_t sceSysmoduleLoadModule(int module);
uint32_t sceSysmoduleLoadModuleInternal(uint32_t module);
