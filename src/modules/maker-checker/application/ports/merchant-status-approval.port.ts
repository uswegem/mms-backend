export interface MerchantStatusApprovalPort {
  onCheckerApproved(merchantId: string, checkerId: string): Promise<void>;
  onCheckerRejected(
    merchantId: string,
    checkerId: string,
    notes?: string,
  ): Promise<void>;
}

export const MERCHANT_STATUS_APPROVAL_PORT = Symbol(
  'MERCHANT_STATUS_APPROVAL_PORT',
);
