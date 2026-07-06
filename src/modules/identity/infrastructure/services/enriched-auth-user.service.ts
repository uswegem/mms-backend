import { Injectable } from '@nestjs/common';
import { RbacService } from '@infrastructure/auth/rbac/rbac.service';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import { UserRepository } from '../persistence/user.repository';

@Injectable()
export class EnrichedAuthUserService {
  constructor(
    private readonly users: UserRepository,
    private readonly rbac: RbacService,
  ) {}

  async fromDbUser(
    user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>,
  ): Promise<AuthUser> {
    const base = this.users.toAuthUser(user);
    const effective = await this.rbac.getEffectivePermissions(user.id);
    return new AuthUser({
      id: base.id,
      email: base.email,
      fullName: base.fullName,
      acquirerId: base.acquirerId,
      merchantId: base.merchantId,
      status: base.status,
      roles: effective.roles,
      permissions: effective.permissions,
      deniedPermissions: effective.deniedPermissions,
      storeIds: effective.storeIds,
      terminalIds: effective.terminalIds,
    });
  }
}
