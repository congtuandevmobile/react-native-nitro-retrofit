import { jest } from '@jest/globals';

export const fetch = jest.fn();
export const prefetch = jest.fn();
export const nitroFetchOnWorklet = jest.fn();
export const prefetchOnAppStart = jest.fn();
export const removeFromAutoPrefetch = jest.fn();
export const removeAllFromAutoprefetch = jest.fn();
export const __readAutoPrefetchQueue = jest.fn();
