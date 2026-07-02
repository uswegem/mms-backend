import { OnboardingStatusMachine } from './onboarding-status.machine';

describe('OnboardingStatusMachine', () => {
  it('allows draft to submit to submitted', () => {
    expect(
      OnboardingStatusMachine.transition('DRAFT', 'SUBMIT'),
    ).toBe('SUBMITTED');
  });

  it('blocks activation from draft', () => {
    expect(() =>
      OnboardingStatusMachine.transition('DRAFT', 'ACTIVATE'),
    ).toThrow();
  });

  it('follows checker approve to bank validation', () => {
    expect(
      OnboardingStatusMachine.transition('UNDER_REVIEW', 'CHECKER_APPROVE'),
    ).toBe('PENDING_BANK_VALIDATION');
  });

  it('follows risk approve to bank validation', () => {
    expect(
      OnboardingStatusMachine.transition('PENDING_RISK_REVIEW', 'RISK_APPROVE'),
    ).toBe('PENDING_BANK_VALIDATION');
  });

  it('allows tps retry from failed state', () => {
    expect(
      OnboardingStatusMachine.transition('TPS_REGISTRATION_FAILED', 'TPS_RETRY'),
    ).toBe('PENDING_TPS_REGISTRATION');
  });

  it('activates from ready or alias issued state', () => {
    expect(OnboardingStatusMachine.canActivate('READY_FOR_ACTIVATION')).toBe(true);
    expect(OnboardingStatusMachine.canActivate('ALIAS_QR_REGISTERED')).toBe(true);
    expect(OnboardingStatusMachine.canActivate('DRAFT')).toBe(false);
  });
});
