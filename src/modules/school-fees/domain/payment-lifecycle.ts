import { BadRequestException } from '@nestjs/common';
import { FeePaymentRecordStatus } from '@prisma/client';

export const PAYMENT_TRANSITIONS: Readonly<Record<FeePaymentRecordStatus, readonly FeePaymentRecordStatus[]>> = {
  INITIATED: ['PENDING', 'FAILED', 'DUPLICATE_IGNORED'],
  PENDING: ['COMPLETED', 'FAILED', 'DISPUTED', 'DUPLICATE_IGNORED'],
  COMPLETED: ['REVERSED', 'DISPUTED'],
  FAILED: [],
  REVERSED: [],
  DISPUTED: ['COMPLETED', 'REVERSED', 'FAILED'],
  DUPLICATE_IGNORED: [],
};

export function assertTransition(
  from: FeePaymentRecordStatus,
  to: FeePaymentRecordStatus,
): void {
  if (!PAYMENT_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`Payment transition ${from} → ${to} is not allowed`);
  }
}
