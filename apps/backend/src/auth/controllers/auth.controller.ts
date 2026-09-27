import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Request, Response } from 'express'
import { StaffLoginDto } from '../dto/staff-login.dto.js'
import { TeamLoginDto } from '../dto/team-login.dto.js'
import { AuthService } from '../services/auth.service.js'
import { JwtAuthGuard, type AuthenticatedRequest } from '../guards/jwt-auth.guard.js'

export const REFRESH_COOKIE = 'refresh_token'

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly config: ConfigService,
    ) {}

    // POST /api/v1/auth/staff/login
    @Post('staff/login')
    @HttpCode(200)
    async staffLogin(@Body() dto: StaffLoginDto, @Res({ passthrough: true }) res: Response) {
        const { refreshToken, ...body } = await this.authService.staffLogin(dto)
        res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions())
        return body
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
    refresh(@Req() req: Request) {
        return this.authService.refresh(req.cookies?.[REFRESH_COOKIE])
    }

    // POST /api/v1/auth/logout
    // No exige access token: debe poder cerrarse sesión aunque ya haya expirado
    @Post('logout')
    @HttpCode(204)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        await this.authService.logout(req.cookies?.[REFRESH_COOKIE])
        const { maxAge, ...options } = this.refreshCookieOptions()
        res.clearCookie(REFRESH_COOKIE, options)
    }

    // GET /api/v1/auth/me
    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@Req() req: AuthenticatedRequest) {
        return this.authService.me(req.user)
    }

    private refreshCookieOptions(): CookieOptions {
        const ttlDays = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 7)
        return {
            httpOnly: true,
            secure: this.config.get<string>('NODE_ENV') === 'production',
            sameSite: 'strict',
            path: '/api/v1/auth',
            maxAge: ttlDays * 24 * 60 * 60 * 1000,
        }
    }
}
