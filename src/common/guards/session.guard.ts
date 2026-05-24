import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from 'src/modules/auth/services/auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.vaultpay_session;
    if (!token) {
      throw new UnauthorizedException('No session token');
    }
    const session = await this.authService.validateSession(token as string);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.user = session;
    return true;
  }
}
