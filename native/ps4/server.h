#ifndef ASTORA_SERVER_H
#define ASTORA_SERVER_H
int ast_server_start(const char *assets, const char *catalog, const char *state);
void ast_log(const char *label, int code);
#endif
