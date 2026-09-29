int n = int.Parse(Console.ReadLine()!); int k = 0;
for (int i = 2; i <= n; i++) { bool p = true; for (int d = 2; (long)d * d <= i; d++) if (i % d == 0) { p = false; break; } if (p) k++; }
Console.WriteLine(k);
