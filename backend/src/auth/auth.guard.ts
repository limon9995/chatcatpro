import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  // V12: async — DB query instead of file read
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = String(req.headers['authorization'] || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) throw new UnauthorizedException('Missing bearer token');

    const user = await this.authService.getAuthUserByToken(token);
    if (!user) throw new UnauthorizedException('Invalid or expired token');

    req.authUser = user;
    req.user = user;
    return true;
  }
}
