export interface KycUpgradeApprovalPort {
  onCheckerApproved(requestId: string, checkerId: string): Promise<void>;
  onCheckerRejected(
    requestId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void>;
}

export const KYC_UPGRADE_APPROVAL_PORT = Symbol('KYC_UPGRADE_APPROVAL_PORT');
