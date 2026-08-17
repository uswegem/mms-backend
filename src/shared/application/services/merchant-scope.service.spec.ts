import { ForbiddenException } from '@nestjs/common';
import { MerchantScopeService } from './merchant-scope.service';
import { ActorContext } from '../interfaces/actor-context.interface';

describe('MerchantScopeService — cross-merchant data leak prevention', () => {
  const scope = new MerchantScopeService();

  function actor(overrides: Partial<ActorContext> = {}): ActorContext {
    return {
      sub: 'user-1',
      email: 'a@mms.local',
      acquirerId: 'acq-1',
      roles: ['MERCHANT_ADMIN'],
      permissions: [],
      merchantId: 'merchant-1',
      ...overrides,
    };
  }

  describe('scopeMerchantId', () => {
    it('forces a merchant-scoped actor onto their own merchantId, ignoring any requested value', () => {
      const result = scope.scopeMerchantId(actor(), 'someone-elses-merchant');
      expect(result).toBe('merchant-1');
    });

    it('leaves the requested filter untouched for a back-office (acquirer-level) actor', () => {
      const result = scope.scopeMerchantId(
        actor({ roles: ['BANK_ADMIN'] }),
        'any-merchant',
      );
      expect(result).toBe('any-merchant');
    });

    it('leaves an unset filter unset for a back-office actor (list everything)', () => {
      const result = scope.scopeMerchantId(
        actor({ roles: ['BANK_ADMIN'] }),
        undefined,
      );
      expect(result).toBeUndefined();
    });

    it('fails closed rather than dropping the filter when a merchant-scoped token has no merchantId', () => {
      expect(() =>
        scope.scopeMerchantId(actor({ merchantId: undefined }), undefined),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanAccessMerchant', () => {
    it('blocks a merchant-scoped actor from a record belonging to a different merchant', () => {
      expect(() =>
        scope.assertCanAccessMerchant(actor(), 'other-merchant'),
      ).toThrow(ForbiddenException);
    });

    it("allows a merchant-scoped actor to access their own merchant's record", () => {
      expect(() =>
        scope.assertCanAccessMerchant(actor(), 'merchant-1'),
      ).not.toThrow();
    });

    it("allows a back-office actor to access any merchant's record", () => {
      expect(() =>
        scope.assertCanAccessMerchant(
          actor({ roles: ['BANK_ADMIN'] }),
          'any-merchant',
        ),
      ).not.toThrow();
    });
  });
});
