import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { QUEUE_NAMES, QUEUE_ROUTING, type StudentAliasGeneratePayload } from '@infrastructure/queue/queue.constants';
import { StudentAliasService } from '../services/student-alias.service';

@Injectable()
export class StudentAliasConsumer {
  private readonly logger = new Logger(StudentAliasConsumer.name);

  constructor(private readonly students: StudentAliasService) {}

  @RabbitSubscribe({
    exchange: '', // resolved dynamically via module config
    routingKey: QUEUE_ROUTING.STUDENT_ALIAS_GENERATE,
    queue: QUEUE_NAMES.STUDENT_ALIAS_GENERATE,
    queueOptions: {
      durable: true,
      arguments: {
        // Dead-letter after 3 retries
        'x-dead-letter-exchange': 'mms.dlx',
        'x-dead-letter-routing-key': QUEUE_ROUTING.STUDENT_ALIAS_GENERATE,
      },
    },
    errorHandler: (channel, msg, error) => {
      // nack without requeue — let DLX handle retries
      channel.nack(msg, false, false);
    },
  })
  async handleAliasGenerate(payload: StudentAliasGeneratePayload): Promise<void> {
    const { studentId, merchantId, actorId, batchId, row } = payload;
    this.logger.log(
      `[batch:${batchId}] row ${row} — issuing alias for student ${studentId}`,
    );

    try {
      await this.students.issueStudentAliasById(studentId, merchantId, actorId);
      this.logger.log(`[batch:${batchId}] row ${row} — alias issued OK`);
    } catch (err) {
      this.logger.error(
        `[batch:${batchId}] row ${row} — alias failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err; // triggers nack → DLX
    }
  }
}
