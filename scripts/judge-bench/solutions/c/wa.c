#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int n; scanf("%d", &n);
    char *c = calloc(n + 1, 1); int k = 0;
    for (long i = 2; i < n; i++) if (!c[i]) { k++; for (long j = i * i; j <= n; j += i) c[j] = 1; }
    printf("%d\n", k);
}
