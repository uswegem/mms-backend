import { RejectTaskHandler } from './reject-task.handler';
import { RejectTaskCommand } from '../commands/reject-task.command';
import { ApprovalEntityType } from '@prisma/client';

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    acquirerId: 'acquirer-1',
    entityType: ApprovalEntityType.MERCHANT_STATUS_CHANGE,
    entityId: 'merchant-1',
    makerId: 'maker-1',
    status: 'REJECTED',
    expiresAt: null,
    createdAt: new Date(),
    decision: null,
    ...overrides,
  };
}

function buildHandler(
  overrides: {
    downstreamThrows?: boolean;
  } = {},
) {
  const task = buildTask();

  const makerChecker = {
    getTask: jest.fn().mockResolvedValue({ ...task, acquirerId: 'acquirer-1' }),
    rejectTask: jest.fn().mockResolvedValue(task),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const merchantStatusApproval = {
    onCheckerApproved: jest.fn().mockResolvedValue(undefined),
    onCheckerRejected: overrides.downstreamThrows
      ? jest.fn().mockRejectedValue(new Error('merchant not found'))
      : jest.fn().mockResolvedValue(undefined),
  };

  const onboardingApproval = {
    onCheckerApproved: jest.fn().mockResolvedValue(undefined),
    onCheckerRejected: jest.fn().mockResolvedValue(undefined),
  };

  const handler = new RejectTaskHandler(
    makerChecker as never,
    audit as never,
    onboardingApproval,
    merchantStatusApproval,
  );

  return {
    handler,
    makerChecker,
    audit,
    merchantStatusApproval,
    onboardingApproval,
  };
}

describe('RejectTaskHandler — audit-trail write-path guarantee', () => {
  const command = new RejectTaskCommand(
    {
      sub: 'checker-1',
      email: 'checker@mms.local',
      acquirerId: 'acquirer-1',
      roles: ['BANK_ADMIN'],
      permissions: [],
    },
    'task-1',
    'not eligible',
  );

  it('records the APPROVAL_TASK_REJECTED audit entry once the task decision is committed', async () => {
    const { handler, audit } = buildHandler();

    await handler.execute(command);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'checker-1',
        action: 'APPROVAL_TASK_REJECTED',
        entityType: 'approval_task',
        entityId: 'task-1',
      }),
    );
  });

  it('still writes the audit row when the downstream merchant-status port throws after the task is rejected', async () => {
    const { handler, audit, makerChecker, merchantStatusApproval } =
      buildHandler({
        downstreamThrows: true,
      });

    await expect(handler.execute(command)).rejects.toThrow(
      'merchant not found',
    );

    expect(makerChecker.rejectTask).toHaveBeenCalledTimes(1);
    expect(merchantStatusApproval.onCheckerRejected).toHaveBeenCalledTimes(1);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVAL_TASK_REJECTED',
        entityId: 'task-1',
      }),
    );
  });

  it('writes the audit entry before invoking the downstream port, not after', async () => {
    const callOrder: string[] = [];
    const { handler, audit, merchantStatusApproval } = buildHandler();
    audit.record.mockImplementation(() => {
      callOrder.push('audit');
      return Promise.resolve();
    });
    merchantStatusApproval.onCheckerRejected.mockImplementation(() => {
      callOrder.push('downstream');
      return Promise.resolve();
    });

    await handler.execute(command);

    expect(callOrder).toEqual(['audit', 'downstream']);
  });
});
