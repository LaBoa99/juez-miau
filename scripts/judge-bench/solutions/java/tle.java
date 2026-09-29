import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt(); int k = 0;
        for (int i = 2; i <= n; i++) { boolean p = true; for (int d = 2; (long) d * d <= i; d++) if (i % d == 0) { p = false; break; } if (p) k++; }
        System.out.println(k);
    }
}
