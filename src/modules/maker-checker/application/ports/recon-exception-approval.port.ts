export const RECON_EXCEPTION_APPROVAL_PORT = Symbol('RECON_EXCEPTION_APPROVAL_PORT');

export interface ReconExceptionApprovalPort {
  onCheckerApproved(caseId: string, checkerId: string, notes?: string): Promise<void>;
  onCheckerRejected(caseId: string, checkerId: string, notes?: string): Promise<void>;
}
