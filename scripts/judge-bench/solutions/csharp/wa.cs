int n = int.Parse(Console.ReadLine()!); var c = new bool[n + 1]; int k = 0;
for (long i = 2; i < n; i++) if (!c[i]) { k++; for (long j = i * i; j <= n; j += i) c[j] = true; }
Console.WriteLine(k);
