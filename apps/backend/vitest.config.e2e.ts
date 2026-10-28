import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Arrancar AppModule sincroniza el esquema: tarda más que el timeout por defecto
    hookTimeout: 90_000,
    // Todos los archivos usan la misma BD; en paralelo chocan al sincronizar el esquema
    fileParallelism: false,
  },
});
