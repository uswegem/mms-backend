import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

/**
 * Swagger helper for paginated list responses — use on controllers when implemented.
 */
export const ApiPaginatedResponse = (model: string) =>
  applyDecorators(
    ApiOkResponse({
      description: `Paginated list of ${model}`,
      schema: {
        properties: {
          data: { type: 'array', items: { $ref: `#/components/schemas/${model}` } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' },
            },
          },
        },
      },
    }),
  );
