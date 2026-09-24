import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

type ErrorDecorator = (options?: { description?: string; type?: Type<unknown> }) => MethodDecorator;

const withErrorSchema =
  (decorator: ErrorDecorator, defaultDescription: string) =>
  (description = defaultDescription) =>
    decorator({ description, type: ApiErrorResponseDto });

export const ApiStandardBadRequest = withErrorSchema(
  ApiBadRequestResponse,
  'Validation failed or malformed request',
);

export const ApiStandardUnauthorized = withErrorSchema(
  ApiUnauthorizedResponse,
  'Authentication required or credentials invalid',
);

export const ApiStandardForbidden = withErrorSchema(
  ApiForbiddenResponse,
  'Insufficient permissions',
);

export const ApiStandardNotFound = withErrorSchema(ApiNotFoundResponse, 'Resource not found');

export const ApiStandardConflict = withErrorSchema(
  ApiConflictResponse,
  'Request conflicts with current state',
);

export const ApiStandardTooManyRequests = withErrorSchema(
  ApiTooManyRequestsResponse,
  'HTTP rate limit or subscription usage limit exceeded',
);

export const ApiStandardServiceUnavailable = withErrorSchema(
  ApiServiceUnavailableResponse,
  'Required dependency temporarily unavailable',
);

export const ApiStandardInternalError = withErrorSchema(
  ApiInternalServerErrorResponse,
  'Unexpected server error',
);

/** Common auth-protected endpoint errors including global throttling. */
export function ApiProtectedErrors(): MethodDecorator {
  return applyDecorators(
    ApiStandardUnauthorized(),
    ApiStandardTooManyRequests(),
    ApiStandardInternalError(),
  );
}
