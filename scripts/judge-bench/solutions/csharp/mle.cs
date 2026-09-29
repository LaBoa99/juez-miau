int n = int.Parse(Console.ReadLine()!); var c = new long[n + 1]; int k = 0;
for (long i = 2; i <= n; i++) if (c[i] == 0) { k++; for (long j = i * i; j <= n; j += i) c[j] = 1; }
Console.WriteLine(k);
