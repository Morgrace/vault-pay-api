import { ISessionData } from 'src/modules/auth/auth.interface';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: ISessionData;
    }
  }
}

export {}; // keeps it a module file — required when using declare global
