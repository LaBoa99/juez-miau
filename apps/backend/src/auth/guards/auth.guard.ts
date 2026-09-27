import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { tryCatch } from "bullmq";
import { Observable } from "rxjs";

@Injectable()
export class AuthGuard implements CanActivate{

    constructor(
        private readonly jwtService: JwtService,
    ){}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if(token == undefined) throw new UnauthorizedException('');
        try {
            const payload = this.jwtService.verifyAsync(token)
            request['user'] = payload
            return true
            
        } catch (error) {
            return false
        }

    }

    private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.get('authorization')?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }


}