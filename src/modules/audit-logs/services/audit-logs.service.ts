import { Injectable } from '@nestjs/common';
import { auditLogs } from 'src/shared/database/schema';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';
import {
  IPaginatedResult,
  IPaginationOptions,
} from 'src/shared/types/query.interfaces';

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogsRepo: AuditLogsRepository) {}
  append(
    data: typeof auditLogs.$inferInsert,
  ): Promise<typeof auditLogs.$inferSelect> {
    return this.auditLogsRepo.append(data);
  }

  findByEntity(
    entityType: string,
    entityId: string,
    options?: IPaginationOptions,
  ): Promise<IPaginatedResult<typeof auditLogs.$inferSelect>> {
    return this.auditLogsRepo.findByEntity(entityType, entityId, options);
  }
}
