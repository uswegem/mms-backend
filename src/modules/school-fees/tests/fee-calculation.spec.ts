import { applyPaymentToInvoice, computeAdjustment, money } from '../domain/fee-money.util';

describe('fee money helpers', () => {
  it('calculates percentage adjustment without floating point arithmetic', () => {
    expect(computeAdjustment('1000.00', undefined, '12.5').toString()).toBe('125');
  });

  it('caps a fixed adjustment at its base amount', () => {
    expect(computeAdjustment('100.00', '250.00').toString()).toBe('100');
  });

  it('computes outstanding totals as decimals', () => {
    const result = applyPaymentToInvoice({ totalAmount: money('200.00'), amountPaid: '20.00', paymentAmount: '30.00' });
    expect(result.outstandingBalance.toString()).toBe('150');
    expect(result.status).toBe('PARTIALLY_PAID');
  });
});
