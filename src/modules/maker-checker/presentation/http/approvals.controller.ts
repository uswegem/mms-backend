import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ListApprovalTasksQuery } from '../../application/queries/list-approval-tasks.query';
import { GetApprovalTaskQuery } from '../../application/queries/get-approval-task.query';
import { ApproveTaskCommand } from '../../application/commands/approve-task.command';
import { RejectTaskCommand } from '../../application/commands/reject-task.command';
import {
  ApprovalDecisionDto,
  ApprovalTaskResponseDto,
  ListApprovalTasksQueryDto,
  PaginatedApprovalTasksDto,
} from '../dto/approval.dto';

function toActor(user: JwtPayload): ActorContext {
  return {
    sub: user.sub,
    email: user.email,
    acquirerId: user.acquirerId,
    merchantId: user.merchantId,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiTags('Approvals')
@ApiBearerAuth('access-token')
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('tasks')
  @RequirePermissions(Permission.APPROVAL_TASK_READ)
  @ApiOperation({ summary: 'List approval tasks (checker inbox)' })
  async listTasks(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApprovalTasksQueryDto,
  ): Promise<PaginatedApprovalTasksDto> {
    return this.queryBus.execute(
      new ListApprovalTasksQuery(
        toActor(user),
        query.page ?? 1,
        query.limit ?? 20,
        query.status,
        query.entityType,
      ),
    );
  }

  @Get('tasks/:id')
  @RequirePermissions(Permission.APPROVAL_TASK_READ)
  @ApiOperation({ summary: 'Get approval task detail' })
  async getTask(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalTaskResponseDto> {
    return this.queryBus.execute(new GetApprovalTaskQuery(toActor(user), id));
  }

  @Post('tasks/:id/approve')
  @RequirePermissions(Permission.APPROVAL_TASK_APPROVE)
  @ApiOperation({ summary: 'Checker approve task' })
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<ApprovalTaskResponseDto> {
    return this.commandBus.execute(
      new ApproveTaskCommand(toActor(user), id, dto.notes),
    );
  }

  @Post('tasks/:id/reject')
  @RequirePermissions(Permission.APPROVAL_TASK_REJECT)
  @ApiOperation({ summary: 'Checker reject task' })
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<ApprovalTaskResponseDto> {
    return this.commandBus.execute(
      new RejectTaskCommand(toActor(user), id, dto.notes),
    );
  }
}
