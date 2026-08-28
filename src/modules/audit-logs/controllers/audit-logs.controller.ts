import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { auditLogs } from 'src/shared/database/schema';
import {
  auditLogQuerySchema,
  auditLogRowSchema,
  type TAuditLogQuery,
} from '../validation/audit-log-validation.schema';
import { AuditLogsService } from '../services/audit-logs.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role, Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { type ISessionData } from 'src/modules/auth/auth.interface';

@Controller('audit-logs')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogsService) {}
  @Get(':entityId')
  findByEntity(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query(new ZodValidationPipe(auditLogQuerySchema))
    query: TAuditLogQuery,
  ) {
    return this.auditLogService.findByEntity(entityId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  append(
    @Body(new ZodValidationPipe(auditLogRowSchema))
    data: typeof auditLogs.$inferInsert,
    @Ip() ip: string,
    @CurrentUser() user: ISessionData,
  ) {
    return this.auditLogService.append({
      ...data,
      ipAddress: ip,
      actorId: user.userId,
    });
  }
}
