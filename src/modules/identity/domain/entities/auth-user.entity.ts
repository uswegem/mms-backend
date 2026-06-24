import { UserStatus } from '@prisma/client';

export interface AuthUserProps {
  id: string;
  email: string;
  fullName: string;
  acquirerId: string;
  merchantId: string | null;
  status: UserStatus;
  roles: string[];
  permissions: string[];
}

export class AuthUser {
  constructor(private readonly props: AuthUserProps) {}

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get acquirerId(): string {
    return this.props.acquirerId;
  }
  get merchantId(): string | null {
    return this.props.merchantId;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get roles(): string[] {
    return this.props.roles;
  }
  get permissions(): string[] {
    return this.props.permissions;
  }

  isActive(): boolean {
    return this.props.status === UserStatus.ACTIVE;
  }

  toJwtPayload() {
    return {
      sub: this.id,
      email: this.email,
      acquirerId: this.acquirerId,
      merchantId: this.merchantId ?? undefined,
      roles: this.roles,
      permissions: this.permissions,
    };
  }
}
