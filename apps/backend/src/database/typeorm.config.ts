// Lo cumplen ConfigService (API, worker, seeder) y { get: (key) => process.env[key] } (migraciones)
export interface EnvReader {
  get(key: string): string | undefined;
}

// Conexión compartida entre la app, el worker, el seeder y las migraciones: un cambio aquí
// (SSL, pool) aplica a todos
export const buildTypeOrmOptions = (env: EnvReader) => {
  const required = (key: string): string => {
    const value = env.get(key);
    if (!value) throw new Error(key + ' is not set');
    return value;
  };

  return {
    type: 'postgres' as const,
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    username: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    database: required('DB_DATABASE'),
    synchronize: env.get('DB_SYNCHRONIZE') === 'true',
  };
};
