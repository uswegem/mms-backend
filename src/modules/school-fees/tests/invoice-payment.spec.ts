import { applyPaymentToInvoice } from '../domain/fee-money.util';

describe('invoice payment state transitions', () => {
  it('supports a partial payment', () => {
    const state = applyPaymentToInvoice({ totalAmount: '100.00', amountPaid: '0', paymentAmount: '30.00' });
    expect(state.status).toBe('PARTIALLY_PAID');
    expect(state.outstandingBalance.toString()).toBe('70');
  });

  it('credits overpayment while marking the invoice paid', () => {
    const state = applyPaymentToInvoice({ totalAmount: '100', amountPaid: '90', paymentAmount: '25' });
    expect(state.status).toBe('PAID');
    expect(state.overpayment.toString()).toBe('15');
  });

  it('remains paid after subsequent application', () => {
    const state = applyPaymentToInvoice({ totalAmount: '100', amountPaid: '100', paymentAmount: '0' });
    expect(state.status).toBe('PAID');
  });
});
