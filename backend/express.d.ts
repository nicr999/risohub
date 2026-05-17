// Extends Express's Request type so req.user is available after authenticate middleware
// without needing type assertions on every route.

import { UserRole } from './models/index';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        twoFactorEnabled: boolean;
      };
    }
  }
}

export {};
