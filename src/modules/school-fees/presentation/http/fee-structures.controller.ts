import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@infrastructure/auth/rbac/decorators/permissions.decorator';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { CurrentUser } from '@shared/application/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/identity/infrastructure/strategies/jwt.strategy';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';
import { FeeStructureService } from '../../application/services/fee-structure.service';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { CreateFeeStructureDto, UpdateFeeStructureDto } from '../dto/school-fee.dto';

const toActor = (u: JwtPayload): ActorContext => ({
  sub: u.sub,
  email: u.email,
  acquirerId: u.acquirerId,
  merchantId: u.merchantId,
  roles: u.roles,
  permissions: u.permissions,
});

@ApiTags('School Fee Structures')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId/fee-structures')
export class FeeStructuresController {
  constructor(
    private readonly fees: FeeStructureService,
    private readonly access: SchoolAccessService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SCHOOL_FEE_READ)
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.list(m);
  }

  @Get(':id')
  @RequirePermissions(Permission.SCHOOL_FEE_READ)
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.get(m, id);
  }

  @Post()
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: CreateFeeStructureDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.createDraft(
      m,
      {
        ...d,
        items: d.items.map((x) => ({
          ...x,
          dueDate: x.dueDate ? new Date(x.dueDate) : undefined,
        })),
      },
      user.sub,
    );
  }

  @Patch(':id')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateFeeStructureDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.updateDraft(
      m,
      id,
      {
        ...d,
        items: d.items.map((x) => ({
          ...x,
          dueDate: x.dueDate ? new Date(x.dueDate) : undefined,
        })),
      },
      user.sub,
    );
  }

  @Post(':id/publish')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async publish(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.publish(m, id, user.sub);
  }

  @Post(':id/archive')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async archive(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.archive(m, id, user.sub);
  }

  @Post(':id/amend')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async amend(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.amendPublished(m, id, user.sub);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.fees.deleteDraft(m, id);
  }
}
