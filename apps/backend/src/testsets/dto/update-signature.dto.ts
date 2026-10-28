import { IsArray, IsObject, IsString } from 'class-validator';
import type { IProblemSignature, ISignatureParam, TypeRef } from '@concurso/shared-types';

// Solo la forma general; el contenido lo valida `validateSignature`
export class UpdateSignatureDto implements IProblemSignature {

    @IsString()
    declare functionName: string;

    @IsArray()
    declare params: ISignatureParam[];

    @IsObject()
    declare returns: TypeRef;
}
