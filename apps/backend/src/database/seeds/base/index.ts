import type { Seeder } from '../seeder.interface.js';
import { staffUserSeeder } from './staff-user.seeder.js';
import { languageSeeder } from './language.seeder.js';

// Datos que deben existir en cualquier ambiente (dev y prod)
export const baseSeeders: Seeder[] = [
    staffUserSeeder,
    languageSeeder,
]
