import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt(); boolean[] c = new boolean[n + 1]; int k = 0;
        for (long i = 2; i < n; i++) if (!c[(int) i]) { k++; for (long j = i * i; j <= n; j += i) c[(int) j] = true; }
        System.out.println(k);
    }
}
