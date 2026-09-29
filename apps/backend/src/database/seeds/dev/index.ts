import type { Seeder } from '../seeder.interface.js';
import { devStaffUserSeeder } from './staff-user.seeder.js';
import { devEditionSeeder } from './edition.seeder.js';
import { devCategorySeeder } from './category.seeder.js';
import { devRoomSeeder } from './room.seeder.js';
import { devEditionStaffSeeder } from './edition-staff.seeder.js';
import { devTeamSeeder } from './team.seeder.js';
import { devTeamMemberSeeder } from './team-member.seeder.js';

// Datos de prueba solo para desarrollo local. Nunca se corre en prod.
// El orden importa: primero los padres y después quien tiene la llave foránea hacia ellos
export const devSeeders: Seeder[] = [
    devStaffUserSeeder,
    devEditionSeeder,
    devCategorySeeder,     // → edition
    devRoomSeeder,         // → edition, category
    devEditionStaffSeeder, // → edition, staff_user
    devTeamSeeder,         // → edition, category, room
    devTeamMemberSeeder,   // → team
]
