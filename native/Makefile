ifndef OO_PS4_TOOLCHAIN
$(error Set OO_PS4_TOOLCHAIN to the OpenOrbis 0.5.4 root)
endif
CC := clang-18
LD := ld.lld-18
SDK := $(OO_PS4_TOOLCHAIN)
BUILD := build
PKG := $(BUILD)/package
CFLAGS := --target=x86_64-pc-freebsd12-elf -std=c11 -O2 -fPIC -funwind-tables -fno-stack-protector -Wall -Wextra -Werror -Wno-ignored-attributes -DCJSON_NESTING_LIMIT=32 -isysroot "$(SDK)" -isystem "$(SDK)/include" -Ips4 -Ivendor
LIBS := -lc -lkernel -lSceNet -lSceNetCtl -lSceSysmodule -lSceHttp -lSceSsl -lSceUserService -lSceWebBrowserDialog -lSceCommonDialog -lSceSystemService
OBJS := $(BUILD)/main.o $(BUILD)/server.o $(BUILD)/backend.o $(BUILD)/browser.o $(BUILD)/cJSON.o
.PHONY: all prepare package
all: $(PKG)/eboot.bin
$(BUILD):
	mkdir -p $(BUILD) $(PKG)
$(BUILD)/%.o: ps4/%.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/cJSON.o: vendor/cJSON.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/astora.elf: $(OBJS)
	$(LD) -m elf_x86_64 -pie --script "$(SDK)/link.x" --eh-frame-hdr -L"$(SDK)/lib" $(OBJS) "$(SDK)/lib/crt1.o" $(LIBS) -o $@
$(PKG)/eboot.bin: $(BUILD)/astora.elf
	"$(SDK)/bin/linux/create-fself" -in=$< -out=$(BUILD)/astora.oelf --eboot=$@ --paid 0x3800000000000011
prepare: all
	python3 prepare-package.py "$(SDK)"
package: prepare
	cd $(PKG) && DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 "$(SDK)/bin/linux/PkgTool.Core" pkg_build package.gp4 ..
