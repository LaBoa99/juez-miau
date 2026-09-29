import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Language } from "../entities/language.entity.js";
import { Repository } from "typeorm";
import { CreateLanguageDto } from "../dtos/create-language.dto.js";

@Injectable()
export class LanguagesService {
    
    constructor(
        @InjectRepository(Language)
        private readonly _repository: Repository<Language>
    ) {

    }


    getAllLanguages(){
        return this._repository.find()
    }

    async create(dto: CreateLanguageDto){
        // El DTO ya llega normalizado (trim, minúsculas, file_ext sin punto)
        const isCodeAvailable = await this._repository.countBy({ code: dto.code }) == 0
        if(!isCodeAvailable){
            throw new BadRequestException("code is not available")
        }

        const isFileExtAvailable = await this._repository.countBy({ file_ext: dto.file_ext }) == 0
        if(!isFileExtAvailable){
            throw new BadRequestException("file extension is not available")
        }

        const language = this._repository.create({
            code: dto.code,
            file_ext: dto.file_ext,
            image_ref: dto.image_ref,
            compile_cmd: dto.compile_cmd,
            run_cmd: dto.run_cmd,
            compiler_version: dto.compiler_version,
            flags: dto.flags ?? '',
            time_multiplier: dto.time_multiplier,
            active: dto.active ?? true,
        })

        return this._repository.save(language)
    }

    async toggleLanguage(uuid: string){
        const language = await this._repository.findOne({ where: { id: uuid }})
        if(!language){
            throw new NotFoundException("language not found #" + uuid)
        }

        language.active = !language.active

        return this._repository.save(language)

    }

    public getRepository(){
        return this._repository
    }
}