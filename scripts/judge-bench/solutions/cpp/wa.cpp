#include <iostream>
#include <vector>
int main() {
    int n; std::cin >> n; std::vector<char> c(n + 1); int k = 0;
    for (long i = 2; i < n; i++) if (!c[i]) { k++; for (long j = i * i; j <= n; j += i) c[j] = 1; }
    std::cout << k << "\n";
}
