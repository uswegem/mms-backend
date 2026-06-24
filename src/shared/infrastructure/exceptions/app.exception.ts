import { HttpException, HttpStatus } from '@nestjs/common';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    status: HttpStatus,
    detail: string,
    options?: {
      title?: string;
      type?: string;
      errors?: Array<{ field: string; message: string }>;
      extra?: Record<string, unknown>;
    },
  ) {
    const title = options?.title ?? HttpStatus[status] ?? 'Error';
    super(
      {
        type: options?.type ?? `https://mms.example/errors/${status}`,
        title,
        status,
        code,
        detail,
        errors: options?.errors,
        ...options?.extra,
      } satisfies ProblemDetails,
      status,
    );
  }
}
