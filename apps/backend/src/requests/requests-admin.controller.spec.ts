import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../common/guards/admin.guard';
import { RequestsAdminController } from './requests-admin.controller';
import type { RequestsService } from './requests.service';

describe('Request diagnostic and recovery authorization', () => {
  it.each(['getDiagnostics', 'reconcile'] as const)(
    'keeps %s behind the admin guard for sessions and API tokens',
    (method) => {
      const guards: (new () => AdminGuard)[] = Reflect.getMetadata(
        GUARDS_METADATA,
        RequestsAdminController,
      );
      expect(guards).toContain(AdminGuard);
      const requestService = {
        getDiagnostics: jest.fn(),
        reconcileSubmission: jest.fn(),
      };
      const controller = new RequestsAdminController(
        requestService as unknown as RequestsService,
      );
      for (const auth of [
        { session: { user: { id: 'user', role: 'user' } } },
        { apiTokenUser: { id: 'user', role: 'user' } },
      ]) {
        const context = {
          switchToHttp: () => ({ getRequest: () => auth }),
        } as ExecutionContext;
        expect(() => {
          for (const Guard of guards) new Guard().canActivate(context);
          controller[method]('private-request');
        }).toThrow(ForbiddenException);
      }
      expect(requestService.getDiagnostics).not.toHaveBeenCalled();
      expect(requestService.reconcileSubmission).not.toHaveBeenCalled();
    },
  );
});
