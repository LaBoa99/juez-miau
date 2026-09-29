import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt(); long[] c = new long[n + 1]; int k = 0;
        for (long i = 2; i <= n; i++) if (c[(int) i] == 0) { k++; for (long j = i * i; j <= n; j += i) c[(int) j] = 1; }
        System.out.println(k);
    }
}
