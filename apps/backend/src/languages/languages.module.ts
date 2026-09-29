import { Module } from '@nestjs/common';
import { LanguagesController } from './controllers/languages.controller.js';
import { LanguagesService } from './services/languages.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Language } from './entities/language.entity.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([ Language ]),
    ],
    controllers: [
        LanguagesController,
    ],
    providers: [
        LanguagesService,
    ],
    exports: [
        LanguagesService,
    ]
})
export class LanguagesModule {}
