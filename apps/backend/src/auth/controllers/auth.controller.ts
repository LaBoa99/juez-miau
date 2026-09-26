import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { StaffLoginDto } from '../dto/staff-login.dto.js'
import { TeamLoginDto } from '../dto/team-login.dto.js'
import { RefreshDto } from '../dto/refresh.dto.js'
import { AuthService } from '../services/auth.service.js'

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // POST /api/v1/auth/staff/login
    @Post('staff/login')
    @HttpCode(200)
    staffLogin(@Body() dto: StaffLoginDto) {
        return this.authService.staffLogin(dto)
    }

    // POST /api/v1/auth/team/login
    @Post('team/login')
    @HttpCode(200)
    teamLogin(@Body() dto: TeamLoginDto) {
        return this.authService.teamLogin(dto)
    }

    // POST /api/v1/auth/refresh
    @Post('refresh')
    @HttpCode(200)
    refresh(@Body() dto: RefreshDto) {
        return this.authService.refresh(dto)
    }

    // POST /api/v1/auth/logout
    @Post('logout')
    @HttpCode(204)
    logout() {
        return this.authService.logout()
    }

    // GET /api/v1/auth/me
    @Get('me')
    me() {
        return this.authService.me()
    }
}