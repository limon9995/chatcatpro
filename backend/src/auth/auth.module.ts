import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { ResellerLookupModule } from '../reseller/reseller-lookup.module';

@Module({
  imports: [PrismaModule, ResellerLookupModule],
  providers: [AuthService, AuthGuard, OtpService],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard, OtpService],
})
export class AuthModule {}
