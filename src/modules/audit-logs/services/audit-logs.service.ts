import { Injectable } from '@nestjs/common';
import { auditLogs } from 'src/shared/database/schema';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';
import { IPaginatedResult, IPaginationOptions } from 'src/shared/types';
import { DbOrTx } from 'src/shared/database/base.repository';

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogsRepo: AuditLogsRepository) {}
  append(
    data: typeof auditLogs.$inferInsert,
    tx?: DbOrTx,
  ): Promise<typeof auditLogs.$inferSelect> {
    return this.auditLogsRepo.append(data, tx);
  }

  findByEntity(
    entityId: string,
    options: IPaginationOptions,
  ): Promise<IPaginatedResult<typeof auditLogs.$inferSelect>> {
    return this.auditLogsRepo.findByEntity(entityId, options);
  }
}
