import { Logger } from '@nestjs/common';
import { StaffRole } from '@concurso/shared-types';
import { Edition } from '../../../editions/entities/edition.entity.js';
import { EditionStaff } from '../../../editions/entities/edition-staff.entity.js';
import { StaffUser } from '../../../staff/entities/staff-user.entity.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_EDITION, DEMO_STAFF } from './constants.js';

const logger = new Logger('DevEditionStaffSeeder')

// Tabla intermedia: depende de dev/edition y dev/staff-user
export const devEditionStaffSeeder: Seeder = {
    name: 'dev/edition-staff',
    async run({ manager }) {
        const edition = await manager.findOneByOrFail(Edition, { name: DEMO_EDITION })

        for (const { email, role } of DEMO_STAFF) {
            const user = await manager.findOneByOrFail(StaffUser, { email })
            if (await manager.existsBy(EditionStaff, { edition_id: edition.id, staff_user_id: user.id })) continue

            await manager.insert(EditionStaff, { edition_id: edition.id, staff_user_id: user.id, role: StaffRole[role] })
            logger.log(`${email} asignado como ${role}`)
        }
    },
}
