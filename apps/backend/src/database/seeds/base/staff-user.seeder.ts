import { Logger } from '@nestjs/common';
import { StaffUser } from '../../../staff/entities/staff-user.entity.js';
import type { Seeder } from '../seeder.interface.js';

const logger = new Logger('StaffUserSeeder')

export const staffUserSeeder: Seeder = {
    name: 'base/staff-user',
    async run({ manager, config, passwords }) {
        const email = config.getOrThrow<string>('SEED_ADMIN_EMAIL')
        const password = config.getOrThrow<string>('SEED_ADMIN_PASSWORD')

        if (await manager.existsBy(StaffUser, { email })) {
            logger.log(`superadmin ${email} ya existe, se omite`)
            return
        }

        await manager.insert(StaffUser, {
            name: 'Administrador',
            email,
            password_hash: await passwords.hashPassword(password),
            is_superadmin: true,
        })
        logger.log(`superadmin ${email} creado`)
    },
}
