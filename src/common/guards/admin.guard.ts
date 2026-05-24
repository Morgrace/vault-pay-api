import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SessionGuard } from './session.guard';

@Injectable()
export class AdminGuard extends SessionGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest();
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
