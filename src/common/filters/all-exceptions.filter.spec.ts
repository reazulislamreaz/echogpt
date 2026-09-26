import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/test',
          headers: { 'x-request-id': 'req-123' },
        }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('returns the standard envelope for HttpException', () => {
    filter.catch(new NotFoundException('User not found'), host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'User not found',
        error: 'Not Found',
        path: '/api/v1/test',
        requestId: 'req-123',
        timestamp: expect.any(String),
      }),
    );
  });

  it('preserves validation message arrays', () => {
    filter.catch(new BadRequestException(['email must be an email', 'password too short']), host);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['email must be an email', 'password too short'],
        error: 'Bad Request',
      }),
    );
  });

  it('sanitizes unexpected errors without leaking internals', () => {
    filter.catch(new Error('prisma: connection refused at 127.0.0.1'), host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );
    const body = mockJson.mock.calls[0][0] as { message: string };
    expect(body.message).not.toMatch(/prisma|127\.0\.0\.1/i);
  });
});
