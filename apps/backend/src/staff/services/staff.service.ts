import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { StaffUser } from '../entities/staff-user.entity.js'
import { RefreshToken } from '../../auth/entities/refresh-token.entity.js'
import { ListStaffQueryDto } from '../dto/list-staff-query.dto.js'
import { CreateStaffDto } from '../dto/create-staff.dto.js'
import { UpdateStaffDto } from '../dto/update-staff.dto.js'
import { PasswordService } from '../../utils/services/password.service.js'

@Injectable()
export class StaffService {
    constructor(
        @InjectRepository(StaffUser) private readonly staffRepo: Repository<StaffUser>,
        @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
        private readonly passwordService: PasswordService,
    ) {}

    // password_hash tiene select: false, por eso hay que pedirlo explícitamente
    async findByEmailWithPassword(email: string): Promise<StaffUser | null> {
        return this.staffRepo
            .createQueryBuilder('user')
            .addSelect('user.password_hash')
            .where('user.email = :email', { email })
            .getOne()
    }

    async findById(id: number): Promise<StaffUser | null> {
        return this.staffRepo.findOneBy({ id })
    }

    async findAll(query: ListStaffQueryDto) {
        const qb = this.staffRepo.createQueryBuilder('user').orderBy('user.name', 'ASC')

        if (query.active !== undefined) {
            qb.andWhere('user.active = :active', { active: query.active })
        }
        if (query.search) {
            // email es citext; ILIKE hace la búsqueda insensible a mayúsculas en ambos campos
            qb.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', { search: `%${escapeLike(query.search)}%` })
        }

        const users = await qb.getMany()
        return users.map((u) => ({ id: u.id, name: u.name, email: u.email, active: u.active, isSuperadmin: u.is_superadmin, createdAt: u.created_at }))
    }

    async create(dto: CreateStaffDto) {
        await this.assertEmailAvailable(dto.email)

        const user = await this.staffRepo.save(this.staffRepo.create({
            name: dto.name,
            email: dto.email,
            password_hash: await this.passwordService.hashPassword(dto.password),
        }))

        return this.toResponse(user)
    }

    async update(id: number, dto: UpdateStaffDto) {
        const user = await this.getById(id)

        if (dto.email !== undefined && dto.email.toLowerCase() !== user.email.toLowerCase()) {
            await this.assertEmailAvailable(dto.email)
            user.email = dto.email
        }
        if (dto.name !== undefined) {
            user.name = dto.name
        }
        if (dto.password !== undefined) {
            user.password_hash = await this.passwordService.hashPassword(dto.password)
        }

        await this.staffRepo.save(user)

        // Con la contraseña nueva, las sesiones abiertas con la anterior se cierran
        if (dto.password !== undefined) {
            await this.revokeRefreshTokens(id)
        }

        return this.toResponse(user)
    }

    async deactivate(id: number) {
        const user = await this.getById(id)

        user.active = false
        await this.staffRepo.save(user)
        await this.revokeRefreshTokens(id)

        return { id: user.id, active: false }
    }

    private async getById(id: number): Promise<StaffUser> {
        const user = await this.staffRepo.findOneBy({ id })
        if (!user) {
            throw new NotFoundException('staff user not found #' + id)
        }
        return user
    }

    private async assertEmailAvailable(email: string): Promise<void> {
        if (await this.staffRepo.existsBy({ email })) {
            throw new ConflictException('El email ' + email + ' ya está registrado')
        }
    }

    private async revokeRefreshTokens(userId: number): Promise<void> {
        await this.refreshRepo.update({ user: { id: userId }, revoked_at: IsNull() }, { revoked_at: new Date() })
    }

    private toResponse(user: StaffUser) {
        return { id: user.id, name: user.name, email: user.email, active: user.active }
    }

    async findByEmail(email: string) {
        const staffUser = await this.staffRepo.findOne({
            where: { email },
            select: { id: true, name: true, email: true, password_hash: true, is_superadmin: true, active: true, created_at: true },
        })

        if(!staffUser) throw new UnauthorizedException('');

        return staffUser;
    }
}

// Escapa los comodines de LIKE para que el texto buscado se tome literal
function escapeLike(text: string): string {
    return text.replace(/[\\%_]/g, (c) => '\\' + c)
}
