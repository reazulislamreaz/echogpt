import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiGatewayTimeoutResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';

type ErrorDecorator = (options?: { description?: string; type?: Type<unknown> }) => MethodDecorator;

const withErrorSchema =
  (decorator: ErrorDecorator, defaultDescription: string) =>
  (description = defaultDescription) =>
    decorator({ description, type: ApiErrorResponseDto });

export const ApiStandardBadRequest = withErrorSchema(
  ApiBadRequestResponse,
  'Malformed request, invalid path parameter, or business-rule rejection',
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

export const ApiStandardUnprocessable = withErrorSchema(
  ApiUnprocessableEntityResponse,
  'Request body or query failed validation',
);

export const ApiStandardTooManyRequests = withErrorSchema(
  ApiTooManyRequestsResponse,
  'HTTP rate limit or subscription usage limit exceeded',
);

export const ApiStandardServiceUnavailable = withErrorSchema(
  ApiServiceUnavailableResponse,
  'Required dependency temporarily unavailable',
);

export const ApiStandardBadGateway = withErrorSchema(
  ApiBadGatewayResponse,
  'Upstream provider request failed',
);

export const ApiStandardGatewayTimeout = withErrorSchema(
  ApiGatewayTimeoutResponse,
  'Upstream provider request timed out',
);

export const ApiStandardInternalError = withErrorSchema(
  ApiInternalServerErrorResponse,
  'Unexpected server error',
);

/** Public (unauthenticated) endpoints: throttle + unexpected errors. */
export function ApiPublicErrors(): MethodDecorator {
  return applyDecorators(ApiStandardTooManyRequests(), ApiStandardInternalError());
}

/** JWT-authenticated endpoints: auth + throttle + unexpected errors. */
export function ApiAuthErrors(): MethodDecorator {
  return applyDecorators(
    ApiStandardUnauthorized(),
    ApiStandardTooManyRequests(),
    ApiStandardInternalError(),
  );
}

/** ADMIN RBAC endpoints: auth + forbidden + throttle + unexpected errors. */
export function ApiAdminErrors(): MethodDecorator {
  return applyDecorators(
    ApiStandardUnauthorized(),
    ApiStandardForbidden('ADMIN role required'),
    ApiStandardTooManyRequests(),
    ApiStandardInternalError(),
  );
}

/**
 * @deprecated Prefer ApiAuthErrors — kept for call-site compatibility.
 */
export function ApiProtectedErrors(): MethodDecorator {
  return ApiAuthErrors();
}
