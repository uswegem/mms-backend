import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentChannel, PaymentStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { TipsPaymentWebhookDto } from '../../presentation/dto/transaction.dto';

describe('TransactionsService — payment ingestion', () => {
  function buildService(
    overrides: { existing?: unknown; aliasResult?: unknown } = {},
  ) {
    const transactions = {
      findByTipsEndToEndId: jest
        .fn()
        .mockResolvedValue(overrides.existing ?? null),
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: 'payment-1', ...data }),
        ),
      updateStatus: jest.fn(),
    };
    const aliases = {
      findByAlias: jest.fn().mockResolvedValue(
        'aliasResult' in overrides
          ? overrides.aliasResult
          : {
              type: 'merchant',
              record: { merchant: { id: 'merchant-1', acquirerId: 'acq-1' } },
            },
      ),
    };
    const tips = { verifyWebhookSignature: jest.fn().mockReturnValue(true) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new TransactionsService(
      transactions as never,
      aliases as never,
      tips as never,
      audit as never,
    );
    return { service, transactions, aliases, tips, audit };
  }

  const dto: TipsPaymentWebhookDto = {
    alias: '78041992',
    amount: '28000',
    tipsEndToEndId: 'TIPS-ABC123',
  };

  it('creates a SUCCESS payment for a valid confirmation', async () => {
    const { service, transactions } = buildService();
    const result = await service.recordConfirmation(dto, '{}', 'sig');

    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'merchant-1',
        acquirerId: 'acq-1',
        tipsEndToEndId: 'TIPS-ABC123',
        status: PaymentStatus.SUCCESS,
        channel: PaymentChannel.LIPA_NAMBA,
      }),
    );
    expect(result).toMatchObject({ id: 'payment-1' });
  });

  it('is idempotent on tipsEndToEndId — a retried webhook does not double-create', async () => {
    const existing = { id: 'payment-1', tipsEndToEndId: 'TIPS-ABC123' };
    const { service, transactions } = buildService({ existing });

    const result = await service.recordConfirmation(dto, '{}', 'sig');

    expect(transactions.create).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('rejects a confirmation with an invalid webhook signature', async () => {
    const { service, tips, transactions } = buildService();
    tips.verifyWebhookSignature.mockReturnValue(false);

    await expect(
      service.recordConfirmation(dto, '{}', 'bad-sig'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('rejects a confirmation for an alias with no registered merchant', async () => {
    const { service, transactions } = buildService({ aliasResult: null });

    await expect(
      service.recordConfirmation(dto, '{}', 'sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('honours simulateOutcome=FAILED for dev/test scenarios', async () => {
    const { service, transactions } = buildService();
    await service.recordConfirmation(
      { ...dto, simulateOutcome: 'FAILED' },
      '{}',
      'sig',
    );

    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PaymentStatus.FAILED,
        tipsSettledAt: undefined,
      }),
    );
  });
});
