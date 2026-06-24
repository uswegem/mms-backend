export interface ActorContext {
  sub: string;
  email: string;
  acquirerId: string;
  merchantId?: string;
  roles: string[];
  permissions: string[];
}
