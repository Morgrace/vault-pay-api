import { Module } from '@nestjs/common';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { AuditLogsRepository } from './repositories/audit-logs.repository';
import { AuditLogsService } from './services/audit-logs.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsRepository, AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
