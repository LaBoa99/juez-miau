import { IsBoolean } from 'class-validator';

export class TeamSuspensionDto {
    @IsBoolean()
    declare suspended: boolean;
}
