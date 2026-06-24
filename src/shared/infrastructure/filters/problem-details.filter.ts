import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '../exceptions/error-codes';
import { ProblemDetails } from '../exceptions/app.exception';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ProblemDetails = {
      type: 'https://mms.example/errors/internal',
      title: 'Internal Server Error',
      status,
      code: ErrorCodes.INTERNAL,
      detail: 'An unexpected error occurred',
      correlationId,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        body = { ...(res as ProblemDetails), correlationId };
      } else {
        body = {
          type: `https://mms.example/errors/${status}`,
          title: HttpStatus[status] ?? 'Error',
          status,
          code:
            status === HttpStatus.UNAUTHORIZED
              ? ErrorCodes.UNAUTHORIZED
              : ErrorCodes.VALIDATION,
          detail:
            typeof res === 'string'
              ? res
              : ((res as { message?: string | string[] }).message?.toString() ??
                'Request failed'),
          correlationId,
        };
      }
    } else {
      this.logger.error(exception);
    }

    response.status(status).type('application/problem+json').json(body);
  }
}
