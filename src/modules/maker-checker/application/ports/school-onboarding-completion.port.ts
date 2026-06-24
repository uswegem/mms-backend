export const SCHOOL_ONBOARDING_COMPLETION_PORT = Symbol(
  'SCHOOL_ONBOARDING_COMPLETION_PORT',
);

export interface SchoolOnboardingCompletionPort {
  onSchoolApprovedByApplication(
    applicationId: string,
    actorId: string,
  ): Promise<void>;
}
