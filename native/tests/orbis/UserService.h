#pragma once
#include <stdint.h>
#define ORBIS_USER_SERVICE_ERROR_ALREADY_INITIALIZED UINT32_C(0x80960003)
int32_t sceUserServiceInitialize(void *param);
int32_t sceUserServiceGetInitialUser(int32_t *user);
