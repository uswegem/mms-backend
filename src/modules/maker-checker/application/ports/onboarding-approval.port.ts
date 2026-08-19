export interface OnboardingApprovalPort {
  onCheckerApproved(applicationId: string, checkerId: string): Promise<void>;
  onCheckerRejected(
    applicationId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void>;
}

export const ONBOARDING_APPROVAL_PORT = Symbol('ONBOARDING_APPROVAL_PORT');
