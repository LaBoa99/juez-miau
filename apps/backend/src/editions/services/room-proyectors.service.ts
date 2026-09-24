import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import type { IProjectorTokenResponse } from '@concurso/shared-types';
import { RoomsService } from './rooms.service.js';
import { Room } from '../entities/room.entity.js';
import * as crypto from 'crypto'
import { promisify } from 'util';
import QRCode from 'qrcode';

@Injectable()
export class RoomProyectorsService {

    constructor(
        private readonly roomsService: RoomsService,
        private readonly configService: ConfigService,
    ) {}

    getRepository(): Repository<Room> {
        return this.roomsService.getRepository();
    }

    async assignTokenForRoom(roomId: number): Promise<IProjectorTokenResponse> {
        const room = await this.roomsService.getById(roomId)
        const token = await this.generateToken()

        // En BD solo se guarda el hash; el token en claro solo se devuelve aquí.
        // update() en vez de save(): la columna es select:false y save() no detecta bien su cambio
        await this.roomsService.getRepository().update(room.id, { projector_token_hash: this.hashToken(token) })

        const url = `${this.configService.getOrThrow<string>('FRONT_END_URL')}/dashboard/${token}`

        return {
            token: token,
            qr_png: await this.generateQrPng(url),
            url: url
        }
    }

    async revokeTokenOfRoom(roomId: number): Promise<void> {
         const room = await this.roomsService.getById(roomId)
         await this.roomsService.getRepository().update(room.id, { projector_token_hash: null })
    }

    async generateToken(){
        const fn =  promisify(crypto.randomBytes)
        const buffer = await fn(32)
        return buffer.toString('hex')
    }

    hashToken(token: string){
        return crypto.createHash('sha256').update(token).digest('hex')
    }

    async generateQrPng(url: string){
        const buffer = await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 })
        return buffer.toString('base64')
    }

}
