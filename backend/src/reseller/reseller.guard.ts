import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Used together with AuthGuard + @Roles('reseller_owner'). Loads the caller's
// own Reseller row (a reseller_owner User has exactly one, via
// Reseller.ownerId) and attaches it to the request so handlers never have to
// re-fetch it — and, critically, never operate on a Reseller row the caller
// doesn't own.
@Injectable()
export class ResellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authUser = req.authUser;
    if (!authUser) throw new ForbiddenException('Not authenticated');

    const reseller = await this.prisma.reseller.findUnique({
      where: { ownerId: authUser.id },
    });
    if (!reseller || !reseller.isActive) {
      throw new ForbiddenException('No active reseller account found');
    }

    req.reseller = reseller;
    return true;
  }
}
