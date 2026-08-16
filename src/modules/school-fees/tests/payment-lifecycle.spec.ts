import { BadRequestException } from '@nestjs/common';
import { FeePaymentRecordStatus } from '@prisma/client';
import { assertTransition } from '../domain/payment-lifecycle';

describe('payment lifecycle', () => {
  it('allows a pending payment to complete', () => {
    expect(() => assertTransition(FeePaymentRecordStatus.PENDING, FeePaymentRecordStatus.COMPLETED)).not.toThrow();
  });

  it('does not allow a reversed payment to complete', () => {
    expect(() => assertTransition(FeePaymentRecordStatus.REVERSED, FeePaymentRecordStatus.COMPLETED)).toThrow(BadRequestException);
  });
});
