import { ApprovalEntityType } from '@prisma/client';
import { MakerCheckerService } from './maker-checker.service';
import { ApprovalValidationException } from '../../domain/exceptions/approval.exceptions';

function buildService() {
  const approvals = {
    findPolicy: jest.fn(),
    listPolicies: jest.fn(),
    upsertPolicy: jest.fn(),
    findPendingByEntity: jest.fn(),
    createTask: jest.fn(),
    findTaskById: jest.fn(),
    findMany: jest.fn(),
    decideTask: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MakerCheckerService(approvals as never, audit as never);
  return { service, approvals, audit };
}

describe('MakerCheckerService — policy configuration (cfgmc)', () => {
  describe('listPolicies', () => {
    it('returns every configurable activity, defaulting unconfigured ones to enabled/24h', async () => {
      const { service, approvals } = buildService();
      approvals.listPolicies.mockResolvedValue([
        {
          entityType: ApprovalEntityType.MERCHANT_ONBOARDING,
          enabled: false,
          slaHours: 8,
          updatedAt: new Date('2026-08-01T00:00:00Z'),
        },
      ]);

      const result = await service.listPolicies('acquirer-1');

      expect(result).toEqual([
        {
          entityType: ApprovalEntityType.MERCHANT_ONBOARDING,
          enabled: false,
          slaHours: 8,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          entityType: ApprovalEntityType.SCHOOL_ONBOARDING,
          enabled: true,
          slaHours: 24,
          updatedAt: null,
        },
        {
          entityType: ApprovalEntityType.MERCHANT_STATUS_CHANGE,
          enabled: true,
          slaHours: 24,
          updatedAt: null,
        },
        {
          entityType: ApprovalEntityType.DISPUTE_REFUND,
          enabled: true,
          slaHours: 24,
          updatedAt: null,
        },
        {
          entityType: ApprovalEntityType.KYC_TIER_UPGRADE,
          enabled: true,
          slaHours: 24,
          updatedAt: null,
        },
      ]);
    });

    it('only queries the entity types with a real workflow gate', async () => {
      const { service, approvals } = buildService();
      approvals.listPolicies.mockResolvedValue([]);

      await service.listPolicies('acquirer-1');

      expect(approvals.listPolicies).toHaveBeenCalledWith('acquirer-1', [
        ApprovalEntityType.MERCHANT_ONBOARDING,
        ApprovalEntityType.SCHOOL_ONBOARDING,
        ApprovalEntityType.MERCHANT_STATUS_CHANGE,
        ApprovalEntityType.DISPUTE_REFUND,
        ApprovalEntityType.KYC_TIER_UPGRADE,
      ]);
    });
  });

  describe('updatePolicy', () => {
    it('rejects an entity type with no real workflow gate', async () => {
      const { service } = buildService();

      await expect(
        service.updatePolicy(
          'acquirer-1',
          ApprovalEntityType.FEE_RULE,
          false,
          24,
          'actor-1',
        ),
      ).rejects.toThrow(ApprovalValidationException);
    });

    it('upserts and returns the saved policy for a configurable entity type', async () => {
      const { service, approvals } = buildService();
      approvals.findPolicy.mockResolvedValue({ enabled: true, slaHours: 24 });
      approvals.upsertPolicy.mockResolvedValue({
        id: 'policy-1',
        entityType: ApprovalEntityType.MERCHANT_STATUS_CHANGE,
        enabled: false,
        slaHours: 12,
        updatedAt: new Date('2026-08-19T00:00:00Z'),
      });

      const result = await service.updatePolicy(
        'acquirer-1',
        ApprovalEntityType.MERCHANT_STATUS_CHANGE,
        false,
        12,
        'actor-1',
      );

      expect(approvals.upsertPolicy).toHaveBeenCalledWith(
        'acquirer-1',
        ApprovalEntityType.MERCHANT_STATUS_CHANGE,
        false,
        12,
      );
      expect(result).toEqual({
        entityType: ApprovalEntityType.MERCHANT_STATUS_CHANGE,
        enabled: false,
        slaHours: 12,
        updatedAt: '2026-08-19T00:00:00.000Z',
      });
    });

    it('records an audit entry with the before/after values', async () => {
      const { service, approvals, audit } = buildService();
      approvals.findPolicy.mockResolvedValue({ enabled: true, slaHours: 24 });
      approvals.upsertPolicy.mockResolvedValue({
        id: 'policy-2',
        entityType: ApprovalEntityType.MERCHANT_ONBOARDING,
        enabled: false,
        slaHours: 8,
        updatedAt: new Date('2026-08-19T00:00:00Z'),
      });

      await service.updatePolicy(
        'acquirer-1',
        ApprovalEntityType.MERCHANT_ONBOARDING,
        false,
        8,
        'actor-1',
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-1',
          action: 'APPROVAL_POLICY_UPDATED',
          // entityId must be the policy row's real UUID (a DB uuid column)
          // — not a composite "acquirerId:entityType" string, which fails
          // at the database with an invalid-UUID error.
          entityId: 'policy-2',
        }),
      );
      const [call] = audit.record.mock.calls[0] as [
        { metadata: { before: unknown; after: unknown } },
      ];
      expect(call.metadata.before).toEqual({ enabled: true, slaHours: 24 });
      expect(call.metadata.after).toEqual({ enabled: false, slaHours: 8 });
    });
  });
});
