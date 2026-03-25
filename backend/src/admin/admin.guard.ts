import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-admin-key'];

    if (!process.env.ADMIN_KEY) {
      throw new UnauthorizedException('ADMIN_KEY not set');
    }

    if (!key || key !== process.env.ADMIN_KEY) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
