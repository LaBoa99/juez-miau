#include <iostream>
int main() {
    int n; std::cin >> n; int k = 0;
    for (int i = 2; i <= n; i++) { bool p = true; for (int d = 2; (long)d * d <= i; d++) if (i % d == 0) { p = false; break; } k += p; }
    std::cout << k << "\n";
}
