// Ejecuta un caso de prueba con límites y reporta tiempo de CPU, tiempo de reloj y memoria pico.
// Se compila estático para poder montarlo en cualquier imagen de lenguaje.
//
// uso: runner <tl_ms> <max_salida_bytes> <entrada> <salida> -- <cmd> [args...]
// imprime: status=OK|TLE|MLE|RE cpu_ms=N wall_ms=N rss_kb=N exit=N sig=N
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static pid_t child;
static volatile sig_atomic_t wall_killed = 0;

static void on_alarm(int sig) {
    (void)sig;
    wall_killed = 1;
    kill(-child, SIGKILL);
}

// Cuántas veces el OOM killer del cgroup (el contenedor) ha matado un proceso
static long oom_kills(void) {
    FILE *f = fopen("/sys/fs/cgroup/memory.events", "r");
    if (!f) return 0;
    char key[64];
    long value, total = 0;
    while (fscanf(f, "%63s %ld", key, &value) == 2)
        if (strcmp(key, "oom_kill") == 0) total = value;
    fclose(f);
    return total;
}

static long ms_since(struct timespec *t0) {
    struct timespec t1;
    clock_gettime(CLOCK_MONOTONIC, &t1);
    return (t1.tv_sec - t0->tv_sec) * 1000 + (t1.tv_nsec - t0->tv_nsec) / 1000000;
}

int main(int argc, char **argv) {
    if (argc < 7 || strcmp(argv[5], "--") != 0) {
        fprintf(stderr, "uso: runner <tl_ms> <max_salida_bytes> <entrada> <salida> -- <cmd> [args...]\n");
        return 2;
    }
    long tl_ms = atol(argv[1]);
    rlim_t max_output = (rlim_t)atoll(argv[2]);
    long oom_before = oom_kills();

    struct timespec t0;
    clock_gettime(CLOCK_MONOTONIC, &t0);

    child = fork();
    if (child < 0) { perror("fork"); return 2; }
    if (child == 0) {
        setpgid(0, 0);
        int in = open(argv[3], O_RDONLY);
        int out = open(argv[4], O_WRONLY | O_CREAT | O_TRUNC, 0644);
        int null = open("/dev/null", O_WRONLY);
        if (in < 0 || out < 0 || null < 0) _exit(126);
        dup2(in, 0);
        dup2(out, 1);
        dup2(null, 2);

        // Límite de CPU del kernel como respaldo del temporizador de reloj
        struct rlimit cpu = { (rlim_t)(tl_ms + 999) / 1000 + 1, (rlim_t)(tl_ms + 999) / 1000 + 2 };
        setrlimit(RLIMIT_CPU, &cpu);
        struct rlimit fsize = { max_output, max_output };
        setrlimit(RLIMIT_FSIZE, &fsize);

        execvp(argv[6], argv + 6);
        _exit(127);
    }
    setpgid(child, child);

    // Tiempo de reloj máximo: 2×TL + 1 s, para cortar programas dormidos o bloqueados
    signal(SIGALRM, on_alarm);
    long wall_limit = tl_ms * 2 + 1000;
    struct itimerval timer = { {0, 0}, { wall_limit / 1000, (wall_limit % 1000) * 1000 } };
    setitimer(ITIMER_REAL, &timer, NULL);

    int status;
    while (waitpid(child, &status, 0) < 0 && errno == EINTR) {}
    long wall_ms = ms_since(&t0);
    struct itimerval off = {0};
    setitimer(ITIMER_REAL, &off, NULL);
    kill(-child, SIGKILL); // hilos/procesos huérfanos del participante

    struct rusage ru;
    getrusage(RUSAGE_CHILDREN, &ru);
    long cpu_ms = (ru.ru_utime.tv_sec + ru.ru_stime.tv_sec) * 1000
                + (ru.ru_utime.tv_usec + ru.ru_stime.tv_usec) / 1000;

    int exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
    int sig = WIFSIGNALED(status) ? WTERMSIG(status) : 0;

    const char *verdict = "OK";
    if (oom_kills() > oom_before) verdict = "MLE";
    else if (wall_killed || cpu_ms > tl_ms || sig == SIGXCPU) verdict = "TLE";
    else if (sig != 0 || exit_code != 0) verdict = "RE";

    printf("status=%s cpu_ms=%ld wall_ms=%ld rss_kb=%ld exit=%d sig=%d\n",
           verdict, cpu_ms, wall_ms, ru.ru_maxrss, exit_code, sig);
    return 0;
}
