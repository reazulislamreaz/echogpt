import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailService } from './services/email.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    RolesModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('app.jwt.accessExpiresIn') ??
          '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`;
        return {
          secret:
            configService.get<string>('app.jwt.accessSecret') ??
            configService.get<string>('app.jwt.secret') ??
            'change-me-access-secret',
          signOptions: {
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, EmailService],
  exports: [AuthService, JwtAuthGuard, EmailService, JwtModule, PassportModule],
})
export class AuthModule {}
