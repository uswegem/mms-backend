import { SchoolAccessService } from '../application/services/school-access.service';

describe('school fee RBAC isolation (feature sketch)', () => {
  it('delegates merchant ownership enforcement to MerchantScopeService', async () => {
    const prisma = { merchant: { findUnique: jest.fn().mockResolvedValue({ id: 'school', acquirerId: 'a', isSchool: true, status: 'ACTIVE' }) } };
    const scope = { assertCanAccessMerchant: jest.fn() };
    const service = new SchoolAccessService(prisma as any, scope as any);
    await service.assertActorCanAccessSchool({ sub: 'user', email: 'u@example.com', acquirerId: 'a', roles: [], permissions: [], merchantId: 'school' }, 'school');
    expect(scope.assertCanAccessMerchant).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'school' }));
  });
});
