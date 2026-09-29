import { Logger } from '@nestjs/common';
import { StaffUser } from '../../../staff/entities/staff-user.entity.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_STAFF, DEV_PASSWORD } from './constants.js';

const logger = new Logger('DevStaffUserSeeder')

export const devStaffUserSeeder: Seeder = {
    name: 'dev/staff-user',
    async run({ manager, passwords }) {
        const password_hash = await passwords.hashPassword(DEV_PASSWORD)

        for (const { name, email } of DEMO_STAFF) {
            if (await manager.existsBy(StaffUser, { email })) continue
            await manager.insert(StaffUser, { name, email, password_hash })
            logger.log(`${email} creado`)
        }
    },
}
