#include <stdio.h>
int main(void) {
    int n; scanf("%d", &n); int k = 0;
    for (int i = 2; i <= n; i++) { int p = 1; for (int d = 2; (long)d * d <= i; d++) if (i % d == 0) { p = 0; break; } k += p; }
    printf("%d\n", k);
}
