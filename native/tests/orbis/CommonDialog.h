#pragma once
#include <stddef.h>
#include <stdint.h>
#define ORBIS_COMMON_DIALOG_MAGIC_NUMBER UINT32_C(0xc0d1a109)
typedef struct { size_t size; uint8_t reserved[36]; uint32_t magic; } OrbisCommonDialogBaseParam;
enum { ORBIS_COMMON_DIALOG_STATUS_NONE, ORBIS_COMMON_DIALOG_STATUS_INITIALIZED,
       ORBIS_COMMON_DIALOG_STATUS_RUNNING, ORBIS_COMMON_DIALOG_STATUS_FINISHED };
int32_t sceCommonDialogInitialize(void);
