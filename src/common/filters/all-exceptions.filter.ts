import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-error-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.normalizeException(exception);

    const body: ApiErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    const requestId = this.extractRequestId(request);
    if (requestId) {
      body.requestId = requestId;
    }

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${statusCode}: ${String(message)}`);
    }

    response.status(statusCode).json(body);
  }

  private extractRequestId(request: Request): string | undefined {
    const header =
      request.headers['x-request-id'] ??
      request.headers['x-correlation-id'] ??
      request.headers['x-amzn-trace-id'];

    if (typeof header === 'string' && header.trim()) {
      return header.trim().slice(0, 128);
    }

    if (Array.isArray(header) && header[0]?.trim()) {
      return header[0].trim().slice(0, 128);
    }

    return undefined;
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          message: exceptionResponse,
          error: this.defaultErrorName(statusCode, exception.name),
        };
      }

      const responseObject = exceptionResponse as Record<string, unknown>;
      const message = (responseObject.message as string | string[]) ?? exception.message;
      const error =
        typeof responseObject.error === 'string'
          ? responseObject.error
          : this.defaultErrorName(statusCode, exception.name);

      return { statusCode, message, error };
    }

    // Never leak Prisma/SQL/stack details to clients
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private defaultErrorName(statusCode: number, fallback: string): string {
    const names: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
      [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };

    return names[statusCode] ?? fallback;
  }
}
