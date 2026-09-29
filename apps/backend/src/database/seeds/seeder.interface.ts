import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import type { PasswordService } from '../../utils/services/password.service.js';

export interface SeedContext {
    manager: EntityManager
    config: ConfigService
    passwords: PasswordService
}

// Cada seeder debe ser idempotente: correrlo N veces deja la BD igual que correrlo 1 vez
export interface Seeder {
    name: string
    run(ctx: SeedContext): Promise<void>
}
