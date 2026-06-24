import { MerchantStatus, MerchantStatusAction } from '@prisma/client';
import { MerchantValidationException } from '@modules/merchants/domain/exceptions/merchant.exceptions';
import { StatusTransitionEngine } from './status-transition.engine';

describe('StatusTransitionEngine', () => {
  const engine = new StatusTransitionEngine();

  it('allows draft to submit for review', () => {
    const rule = engine.findRule(
      MerchantStatus.DRAFT,
      MerchantStatusAction.SUBMIT_FOR_REVIEW,
    );
    expect(rule.toStatus).toBe(MerchantStatus.PENDING_REVIEW);
  });

  it('blocks edit in pending review', () => {
    expect(() => engine.assertCanEdit(MerchantStatus.PENDING_REVIEW)).toThrow();
  });

  it('allows edit in draft', () => {
    expect(() => engine.assertCanEdit(MerchantStatus.DRAFT)).not.toThrow();
  });

  it('blocks maker from approving own merchant', () => {
    expect(() =>
      engine.assertTransitionAllowed(
        MerchantStatus.PENDING_APPROVAL,
        MerchantStatus.ACTIVE,
        MerchantStatusAction.APPROVE,
        ['merchant:status:checker:approve'],
        'maker-user-id',
        'maker-user-id',
      ),
    ).toThrow(MerchantValidationException);
  });

  it('blocks reactivate from closed', () => {
    const actions = engine.getAllowedActions(
      MerchantStatus.CLOSED,
      ['merchant:suspend'],
      null,
      'user-1',
    );
    expect(actions).not.toContain(MerchantStatusAction.REACTIVATE);
  });

  it('returns allowed actions based on permissions', () => {
    const actions = engine.getAllowedActions(
      MerchantStatus.ACTIVE,
      ['merchant:suspend', 'merchant:close'],
      null,
      'user-1',
    );
    expect(actions).toContain(MerchantStatusAction.SUSPEND);
    expect(actions).toContain(MerchantStatusAction.MARK_DORMANT);
    expect(actions).toContain(MerchantStatusAction.CLOSE);
  });
});
