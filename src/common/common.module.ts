import {
  Module,
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

function flattenValidationMessages(errors: ValidationError[], parentPath = ''): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    if (error.children?.length) {
      messages.push(...flattenValidationMessages(error.children, path));
    }
  }

  return messages;
}

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        validationError: {
          target: false,
          value: false,
        },
        exceptionFactory: (errors: ValidationError[]) => {
          const messages = flattenValidationMessages(errors);
          return new UnprocessableEntityException({
            statusCode: 422,
            message: messages.length > 0 ? messages : ['Validation failed'],
            error: 'Unprocessable Entity',
          });
        },
      }),
    },
  ],
})
export class CommonModule {}
