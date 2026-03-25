import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';

@Module({
  imports: [PrismaModule],
  providers: [AuthService, AuthGuard, OtpService],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
