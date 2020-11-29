import type { Server } from 'http';
import request from 'supertest';
import { ExpressHttpServerFactory } from '../../../src/server/ExpressHttpServerFactory';
import { HttpHandler } from '../../../src/server/HttpHandler';
import type { HttpRequest } from '../../../src/server/HttpRequest';
import type { HttpResponse } from '../../../src/server/HttpResponse';
import SpyInstance = jest.SpyInstance;

const handle = async(input: { request: HttpRequest; response: HttpResponse }): Promise<void> => {
  input.response.writeHead(200);
  input.response.end();
};

class SimpleHttpHandler extends HttpHandler {
  public async handle(input: { request: HttpRequest; response: HttpResponse }): Promise<void> {
    return handle(input);
  }
}

describe('ExpressHttpServerFactory', (): void => {
  let server: Server;
  let canHandleJest: jest.Mock<Promise<void>, []>;
  let handleJest: jest.Mock<Promise<void>, [any]>;
  let handler: SimpleHttpHandler;
  let mock: SpyInstance;

  beforeAll(async(): Promise<void> => {
    // Prevent test from writing to stderr
    mock = jest.spyOn(process.stderr, 'write').mockImplementation((): boolean => true);
  });

  beforeEach(async(): Promise<void> => {
    handler = new SimpleHttpHandler();
    canHandleJest = jest.fn(async(): Promise<void> => undefined);
    handleJest = jest.fn(async(input): Promise<void> => handle(input));

    handler.canHandle = canHandleJest;
    handler.handle = handleJest;

    const factory = new ExpressHttpServerFactory(handler);
    server = factory.startServer(5555);
  });

  afterEach(async(): Promise<void> => {
    server.close();
  });

  afterAll(async(): Promise<void> => {
    mock.mockReset();
  });

  it('sends incoming requests to the handler.', async(): Promise<void> => {
    await request(server).get('/').set('Host', 'test.com').expect(200);
    expect(canHandleJest).toHaveBeenCalledTimes(1);
    expect(handleJest).toHaveBeenCalledTimes(1);
    expect(handleJest).toHaveBeenLastCalledWith({
      request: expect.objectContaining({
        headers: expect.objectContaining({ host: 'test.com' }),
      }),
      response: expect.objectContaining({}),
    });
  });

  it('returns a 404 when the handler does not do anything.', async(): Promise<void> => {
    handler.handle = async(input): Promise<void> => {
      expect(input).toBeDefined();
    };
    await request(server).get('/').expect(404);
  });

  it('catches errors thrown by its handler.', async(): Promise<void> => {
    handler.handle = async(): Promise<void> => {
      throw new Error('dummyError');
    };

    const res = await request(server).get('/').expect(500);
    expect(res.text).toContain('dummyError');
  });

  it('throws unknown errors if its handler throw non-Error objects.', async(): Promise<void> => {
    handler.handle = async(): Promise<void> => {
      throw 'apple';
    };

    const res = await request(server).get('/').expect(500);
    expect(res.text).toContain('Unknown error.');
  });
});
