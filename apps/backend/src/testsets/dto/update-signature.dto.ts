import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import type { IProblemSignature, ISignatureParam, TypeRef } from '@concurso/shared-types';

// Solo la forma general; el contenido lo valida `validateSignature`
export class UpdateSignatureDto implements IProblemSignature {

    @IsString()
    declare functionName: string;

    @IsArray()
    declare params: ISignatureParam[];

    @IsObject()
    declare returns: TypeRef;

    // Si la firma nueva solo quita parámetros, también los quita de los casos (y del esquema) en vez de rechazarla
    @IsOptional()
    @IsBoolean()
    declare adaptCases?: boolean;
}
