export interface DisputeRefundApprovalPort {
  onCheckerApproved(disputeId: string, checkerId: string): Promise<void>;
  onCheckerRejected(
    disputeId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void>;
}

export const DISPUTE_REFUND_APPROVAL_PORT = Symbol(
  'DISPUTE_REFUND_APPROVAL_PORT',
);
