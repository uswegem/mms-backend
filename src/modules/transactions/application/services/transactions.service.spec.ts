import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentChannel, PaymentStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { TipsPaymentWebhookDto } from '../../presentation/dto/transaction.dto';

describe('TransactionsService — payment ingestion', () => {
  function buildService(
    overrides: {
      existing?: unknown;
      aliasResult?: unknown;
      checkAndReserve?: unknown;
    } = {},
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
              record: {
                merchant: {
                  id: 'merchant-1',
                  acquirerId: 'acq-1',
                  kycTier: 'TIER_2',
                },
              },
            },
      ),
    };
    const tips = { verifyWebhookSignature: jest.fn().mockReturnValue(true) };
    const events = { publishPaymentConfirmed: jest.fn() };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const limits = {
      checkAndReserve:
        overrides.checkAndReserve ??
        jest.fn().mockResolvedValue({ allowed: true, policy: {} }),
    };

    const service = new TransactionsService(
      transactions as never,
      aliases as never,
      tips as never,
      events,
      audit as never,
      limits as never,
    );
    return { service, transactions, aliases, tips, events, audit, limits };
  }

  const dto: TipsPaymentWebhookDto = {
    alias: '78041992',
    amount: '28000',
    tipsEndToEndId: 'TIPS-ABC123',
  };

  it('creates a SUCCESS payment for a valid confirmation and publishes a live event', async () => {
    const { service, transactions, events } = buildService();
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
    expect(events.publishPaymentConfirmed).toHaveBeenCalledWith(
      'merchant-1',
      expect.objectContaining({
        paymentId: 'payment-1',
        tipsEndToEndId: 'TIPS-ABC123',
      }),
    );
  });

  it('is idempotent on tipsEndToEndId — a retried webhook does not double-create or re-publish', async () => {
    const existing = { id: 'payment-1', tipsEndToEndId: 'TIPS-ABC123' };
    const { service, transactions, events } = buildService({ existing });

    const result = await service.recordConfirmation(dto, '{}', 'sig');

    expect(transactions.create).not.toHaveBeenCalled();
    expect(events.publishPaymentConfirmed).not.toHaveBeenCalled();
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

  it('honours simulateOutcome=FAILED for dev/test scenarios, and does not publish a confirmed event for it', async () => {
    const { service, transactions, events } = buildService();
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
    expect(events.publishPaymentConfirmed).not.toHaveBeenCalled();
  });

  describe('kycTier transaction-limit enforcement (brief §4.3.3)', () => {
    it("checks the limit policy against the receiving merchant's kycTier for an otherwise-SUCCESS confirmation", async () => {
      const { service, limits } = buildService();
      await service.recordConfirmation(dto, '{}', 'sig');

      expect(limits.checkAndReserve).toHaveBeenCalledWith(
        'merchant-1',
        'TIER_2',
        dto.amount,
        expect.any(Date),
      );
    });

    it('records the payment as LIMIT_EXCEEDED rather than SUCCESS when the policy check disallows it, and does not publish a confirmed event', async () => {
      const checkAndReserve = jest
        .fn()
        .mockResolvedValue({ allowed: false, breach: 'DAILY', policy: {} });
      const { service, transactions, events, audit } = buildService({
        checkAndReserve,
      });

      const result = await service.recordConfirmation(dto, '{}', 'sig');

      expect(transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.LIMIT_EXCEEDED }),
      );
      expect(result).toMatchObject({ status: PaymentStatus.LIMIT_EXCEEDED });
      expect(events.publishPaymentConfirmed).not.toHaveBeenCalled();
      const auditCall = (audit.record.mock.calls as unknown[][])[0][0] as {
        action: string;
        metadata: Record<string, unknown>;
      };
      expect(auditCall.action).toBe('PAYMENT_LIMIT_EXCEEDED');
      expect(auditCall.metadata.limitBreach).toBe('DAILY');
    });

    it('does not consult the limit policy at all for a simulateOutcome=FAILED confirmation', async () => {
      const { service, limits } = buildService();
      await service.recordConfirmation(
        { ...dto, simulateOutcome: 'FAILED' },
        '{}',
        'sig',
      );

      expect(limits.checkAndReserve).not.toHaveBeenCalled();
    });
  });
});
