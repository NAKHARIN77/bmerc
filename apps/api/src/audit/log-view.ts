import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { AuditService } from './audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';

const LOG_VIEW = 'logView';

/**
 * Records a successful read of sensitive data (customer contacts, staff list, billing, audit log)
 * as `view.<entity>` in the audit log. The response is sent only after the entry is written.
 */
export const LogView = (entity: string) => applyDecorators(SetMetadata(LOG_VIEW, entity), UseInterceptors(LogViewInterceptor));

@Injectable()
export class LogViewInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entity = this.reflector.get<string>(LOG_VIEW, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      mergeMap(async (body) => {
        const user: AuthUser | undefined = req.user;
        await this.audit.log({
          companyId: user?.companyId,
          actorUserId: user?.id,
          action: `view.${entity}`,
          entityType: entity,
          entityId: req.params?.id,
          after: Object.keys(req.query ?? {}).length ? { query: req.query } : undefined,
          ip: req.ip,
        });
        return body;
      }),
    );
  }
}
