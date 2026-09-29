import { faker } from '@faker-js/faker/locale/es_MX';
import type { Team } from '../../../teams/entities/team.entity.js';
import type { TeamMember } from '../../../teams/entities/team-member.entity.js';

const CAREERS = [
    'Ingeniería en Sistemas Computacionales',
    'Ingeniería en Software',
    'Ingeniería en Computación',
    'Licenciatura en Informática',
    'Ingeniería en Tecnologías de la Información',
]

// faker no trae adjetivos/sustantivos en español, así que el nombre se arma con listas propias
const TEAM_NOUNS = ['Punteros', 'Bytes', 'Algoritmos', 'Compiladores', 'Nodos', 'Recursivos', 'Kernels', 'Bits']
const TEAM_ADJECTIVES = ['Veloces', 'Salvajes', 'Cuánticos', 'Nocturnos', 'Binarios', 'Invencibles', 'Dinámicos', 'Voraces']

// Factory: arma una entidad con datos falsos; `overrides` fija los campos que importan en cada caso
export const makeTeam = (overrides: Partial<Team> = {}): Partial<Team> => ({
    name: `${faker.helpers.arrayElement(TEAM_NOUNS)} ${faker.helpers.arrayElement(TEAM_ADJECTIVES)}`,
    ...overrides,
})

export const makeTeamMember = (overrides: Partial<TeamMember> = {}): Partial<TeamMember> => ({
    full_name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    career: faker.helpers.arrayElement(CAREERS),
    ...overrides,
})
