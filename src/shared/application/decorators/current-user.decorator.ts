import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts authenticated user from request — wired when JWT is implemented.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    return request.user;
  },
);
