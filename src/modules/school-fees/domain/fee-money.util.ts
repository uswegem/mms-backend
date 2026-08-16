import { Prisma } from '@prisma/client';

export const money = (value: Prisma.Decimal.Value = 0) =>
  new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function computeAdjustment(
  base: Prisma.Decimal.Value,
  amountOff?: Prisma.Decimal.Value,
  percentOff?: Prisma.Decimal.Value,
) {
  const amount = money(amountOff ?? 0);
  const percent = money(percentOff ?? 0);
  const percentageAmount = money(money(base).mul(percent).div(100));
  return Prisma.Decimal.min(money(base), amount.gt(0) ? amount : percentageAmount);
}

export function applyPaymentToInvoice(input: {
  totalAmount: Prisma.Decimal.Value;
  amountPaid: Prisma.Decimal.Value;
  paymentAmount: Prisma.Decimal.Value;
}) {
  const total = money(input.totalAmount);
  const paid = money(input.amountPaid);
  const payment = money(input.paymentAmount);
  const newPaid = money(paid.plus(payment));
  const outstanding = Prisma.Decimal.max(money(0), total.minus(newPaid));
  return {
    amountPaid: newPaid,
    outstandingBalance: outstanding,
    overpayment: Prisma.Decimal.max(money(0), newPaid.minus(total)),
    status: outstanding.isZero()
      ? 'PAID' as const
      : newPaid.gt(0)
        ? 'PARTIALLY_PAID' as const
        : 'UNPAID' as const,
  };
}
