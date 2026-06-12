import { jest } from '@jest/globals';
import { fetch as _mockFetch } from 'react-native-nitro-fetch';
import { createNitroRetrofitClient, networkRegisterBuilder } from '../index';

export const SERVER_URL = 'https://api.test';

export const baseResponse = { success: true, message: 'PERFECT !' };

// moduleNameMapper resolves react-native-nitro-fetch → __mocks__ so this is already jest.fn()
export const mockFetch = _mockFetch as jest.MockedFunction<
  (url: string, init: any) => Promise<Response>
>;

/**
 * Create a real Response instance (not a plain-object cast).
 * Using the native Response constructor means instanceof checks work and
 * .clone() / .json() / .text() behave exactly as in production.
 */
export function makeResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function lastCall(): [string, any] {
  const calls = mockFetch.mock.calls;
  if (!calls.length) throw new Error('mockFetch was not called');
  return calls[calls.length - 1] as [string, any];
}

export function setupClient() {
  const client = createNitroRetrofitClient({ baseURL: SERVER_URL });
  networkRegisterBuilder(client);
  return client;
}
