import {
  Body,
  Controller,
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
import { AcademicStructureService } from '../../application/services/academic-structure.service';
import { SchoolAccessService } from '../../application/services/school-access.service';
import { ClassLevelDto, TermDto, YearDto } from '../dto/school-fee.dto';

const toActor = (u: JwtPayload): ActorContext => ({
  sub: u.sub,
  email: u.email,
  acquirerId: u.acquirerId,
  merchantId: u.merchantId,
  roles: u.roles,
  permissions: u.permissions,
});

@ApiTags('School Academic Structure')
@ApiBearerAuth('access-token')
@Controller('schools/:merchantId')
export class AcademicStructureController {
  constructor(
    private readonly structures: AcademicStructureService,
    private readonly access: SchoolAccessService,
  ) {}

  @Get('academic-years')
  @RequirePermissions(Permission.SCHOOL_FEE_READ)
  async years(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.listYears(m);
  }

  @Post('academic-years')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async createYear(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: YearDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.createYear(
      m,
      {
        ...d,
        startsOn: d.startsOn ? new Date(d.startsOn) : undefined,
        endsOn: d.endsOn ? new Date(d.endsOn) : undefined,
      },
      user.sub,
    );
  }

  @Patch('academic-years/:id')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async updateYear(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: YearDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.updateYear(
      m,
      id,
      {
        ...d,
        startsOn: d.startsOn ? new Date(d.startsOn) : undefined,
        endsOn: d.endsOn ? new Date(d.endsOn) : undefined,
      },
      user.sub,
    );
  }

  @Get('terms')
  @RequirePermissions(Permission.SCHOOL_FEE_READ)
  async terms(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.listTerms(m);
  }

  @Post('terms')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async createTerm(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: TermDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.createTerm(
      m,
      {
        ...d,
        startsOn: d.startsOn ? new Date(d.startsOn) : undefined,
        endsOn: d.endsOn ? new Date(d.endsOn) : undefined,
      },
      user.sub,
    );
  }

  @Patch('terms/:id')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async updateTerm(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TermDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.updateTerm(
      m,
      id,
      {
        ...d,
        startsOn: d.startsOn ? new Date(d.startsOn) : undefined,
        endsOn: d.endsOn ? new Date(d.endsOn) : undefined,
      },
      user.sub,
    );
  }

  @Get('class-levels')
  @RequirePermissions(Permission.SCHOOL_FEE_READ)
  async classes(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.listClassLevels(m);
  }

  @Post('class-levels')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async createClass(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Body() d: ClassLevelDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.createClassLevel(m, d, user.sub);
  }

  @Patch('class-levels/:id')
  @RequirePermissions(Permission.SCHOOL_FEE_WRITE)
  async updateClass(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) m: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClassLevelDto,
  ) {
    await this.access.assertActorCanAccessSchool(toActor(user), m);
    return this.structures.updateClassLevel(m, id, d, user.sub);
  }
}
