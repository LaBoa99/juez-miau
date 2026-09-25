import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, randomBytes, randomInt, scrypt } from "crypto";
import { promisify } from "util";


@Injectable()
export class PasswordService {

    private static readonly ALGORITHM = 'aes-256-gcm'
    private static readonly IV_LENGTH = 12
    private static readonly AUTH_TAG_LENGTH = 16

    private masterKey?: Buffer

    constructor(
        private readonly configService: ConfigService
    ) {

    }

    generatePassword(length: number = 12): string {
        const charset: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let password: string = "";

        for(let i = 0; i < length; i++){
            const randomIndex: number = randomInt(0, charset.length)
            password += charset.charAt(randomIndex)
        }

        return password
    }

    /**
     * Cifra la contraseña de forma reversible (AES-256-GCM).
     * Formato de salida: base64(iv).base64(authTag).base64(cipherText)
     */
    async encryptPassword(password: string): Promise<string> {
        try {
            const key = await this.getMasterKey()
            const iv = randomBytes(PasswordService.IV_LENGTH)
            const cipher = createCipheriv(PasswordService.ALGORITHM, key, iv, { authTagLength: PasswordService.AUTH_TAG_LENGTH })

            const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
            const authTag = cipher.getAuthTag()

            return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.')
        } catch (error) {
            if (error instanceof InternalServerErrorException) throw error
            throw new InternalServerErrorException("error al cifrar la contraseña")
        }
    }

    async decryptPassword(payload: string): Promise<string> {
        try {
            const [ivB64, tagB64, dataB64] = payload.split('.')
            if (!ivB64 || !tagB64 || dataB64 === undefined) {
                throw new Error("formato inválido")
            }

            const key = await this.getMasterKey()
            const decipher = createDecipheriv(PasswordService.ALGORITHM, key, Buffer.from(ivB64, 'base64'), { authTagLength: PasswordService.AUTH_TAG_LENGTH })
            decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

            return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
        } catch (error) {
            if (error instanceof InternalServerErrorException) throw error
            throw new InternalServerErrorException("error al descifrar la contraseña")
        }
    }

    async hashPassword(password: string, temp_rounds ?: number): Promise<string> {
        try {
            const rounds = temp_rounds || this.getSaltRounds()
            return bcrypt.genSalt(rounds).then(async (salt) => bcrypt.hash(password, salt))
        } catch(error) {
            throw new InternalServerErrorException("error en contraseña")
        }
    }

    async comparePassword(password: string, hash: string): Promise<Boolean> {
        try {            
            return bcrypt.compare(password, hash)
        } catch (error) {
            throw new InternalServerErrorException("error en contraseña")
        }
    }


    private getSaltRounds(){
        const rounds = this.configService.get<number>('SALT_ROUNDS')
        return rounds ? parseInt(rounds.toString(), 10) : 10
    }

    private async getMasterKey(): Promise<Buffer> {
        if (this.masterKey) return this.masterKey

        const MASTER_KEY = this.configService.get<string>("PASSWORD_ADMIN_MASTERKEY")
        if(!MASTER_KEY){
            throw new InternalServerErrorException("SE DEBE DE PREPARAR UNA MASTERKEY")
        }

        const TEAM_SALT = this.configService.get<string>("TEAM_SALT")
        if(!TEAM_SALT){
            throw new InternalServerErrorException("SE DEBE DE ASIGNAR TEAM SALT")
        }

        const fn = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>
        this.masterKey = await fn(MASTER_KEY, TEAM_SALT, 32)
        return this.masterKey
    }
}