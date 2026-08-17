import { ApproveTaskHandler } from './approve-task.handler';
import { ApproveTaskCommand } from '../commands/approve-task.command';
import { ApprovalEntityType } from '@prisma/client';

function buildTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    acquirerId: 'acquirer-1',
    entityType: ApprovalEntityType.MERCHANT_STATUS_CHANGE,
    entityId: 'merchant-1',
    makerId: 'maker-1',
    status: 'APPROVED',
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
    approveTask: jest.fn().mockResolvedValue(task),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const merchantStatusApproval = {
    onCheckerApproved: overrides.downstreamThrows
      ? jest
          .fn()
          .mockRejectedValue(
            new Error('duplicate transition — refresh and retry'),
          )
      : jest.fn().mockResolvedValue(undefined),
    onCheckerRejected: jest.fn().mockResolvedValue(undefined),
  };

  const onboardingApproval = {
    onCheckerApproved: jest.fn().mockResolvedValue(undefined),
    onCheckerRejected: jest.fn().mockResolvedValue(undefined),
  };

  const handler = new ApproveTaskHandler(
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

describe('ApproveTaskHandler — audit-trail write-path guarantee', () => {
  const command = new ApproveTaskCommand(
    {
      sub: 'checker-1',
      email: 'checker@mms.local',
      acquirerId: 'acquirer-1',
      roles: ['BANK_ADMIN'],
      permissions: [],
    },
    'task-1',
    'looks good',
  );

  it('records the APPROVAL_TASK_APPROVED audit entry once the task decision is committed', async () => {
    const { handler, audit } = buildHandler();

    await handler.execute(command);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'checker-1',
        action: 'APPROVAL_TASK_APPROVED',
        entityType: 'approval_task',
        entityId: 'task-1',
      }),
    );
  });

  it('still writes the audit row when the downstream merchant-status port throws after the task is approved', async () => {
    // This is the exact scenario the write-path guarantee protects against:
    // makerChecker.approveTask() has already durably committed the task's
    // APPROVED status before the downstream port ever runs. If a later,
    // unrelated failure in that port (e.g. a duplicate-transition guard)
    // silently swallowed the audit write for the approval itself, the DB
    // would show an approved task with no audit trail explaining who
    // approved it or when.
    const { handler, audit, makerChecker, merchantStatusApproval } =
      buildHandler({
        downstreamThrows: true,
      });

    await expect(handler.execute(command)).rejects.toThrow(
      'duplicate transition',
    );

    // The task-level DB write already happened — this is the state the
    // system is actually left in after the downstream failure.
    expect(makerChecker.approveTask).toHaveBeenCalledTimes(1);
    expect(merchantStatusApproval.onCheckerApproved).toHaveBeenCalledTimes(1);

    // ...and the audit row for that committed approval must exist despite
    // the later throw — this is the assertion that fails if the audit
    // write is ever moved back to after the downstream port call.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVAL_TASK_APPROVED',
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
    merchantStatusApproval.onCheckerApproved.mockImplementation(() => {
      callOrder.push('downstream');
      return Promise.resolve();
    });

    await handler.execute(command);

    expect(callOrder).toEqual(['audit', 'downstream']);
  });
});
