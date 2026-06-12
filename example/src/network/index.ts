/**
 * Network setup — pure NitroRetrofitClient (no Axios)
 *
 * Flow: Decorator → NitroRetrofitClient → nitro-fetch (C++ JSI)
 *                       ↓
 *               Interceptor pipeline
 *         (auth token, Firebase Perf, Crashlytics, 401 logout)
 *
 * Why drop Axios?
 *  - No extra JS bundle (~13 kB)
 *  - No JS-thread overhead from Axios's queue
 *  - No double JSON parse: nitro-fetch parses once natively, we don't touch it again
 *  - Direct C++ JSI path: HTTP/3 / QUIC / Brotli via Cronet (Android) / URLSession (iOS)
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {
  getCrashlytics,
  log,
  recordError,
} from '@react-native-firebase/crashlytics';
import {
  type FirebasePerformanceTypes,
  getPerformance,
  httpMetric,
} from '@react-native-firebase/perf';

import {
  createNitroRetrofitClient,
  networkRegisterBuilder,
  type RequestContext,
} from 'react-native-nitro-retrofit';

import MyEventEmitter from '../utils/EventEmitter';
import MyEnv from '../configuration/config';
import LocalServices from '../local';

const CONNECTION_TIMEOUT = 10_000;
const LOGIN = '/auth/login';

const NetworkClient = createNitroRetrofitClient({
  baseURL: MyEnv.apiBaseUrl,
  timeout: CONNECTION_TIMEOUT,
  deduplicateRequests: true,
  headers: {
    'os': Platform.OS,
    'User-Agent': DeviceInfo.isEmulatorSync()
      ? DeviceInfo.getUniqueIdSync()
      : DeviceInfo.getUserAgentSync(),
  },
});

NetworkClient.addRequestInterceptor(async (ctx: RequestContext) => {
  const userToken = LocalServices.getAuthKey('@TOKEN');
  if (userToken && !ctx.url.includes(LOGIN)) {
    ctx.headers = {
      ...ctx.headers,
      Authorization: `Bearer ${userToken}`,
    };
  }

  try {
    if (ctx.method) {
      const metric = httpMetric(
        getPerformance(),
        ctx.url,
        ctx.method.toUpperCase() as FirebasePerformanceTypes.HttpMethod
      );
      ctx._httpMetric = metric;
      await metric.start();
    }
  } catch (error) {
    console.log('[perf] start metric error:', error);
  }

  return ctx;
});

NetworkClient.addResponseInterceptor(
  async (response: Response, ctx: RequestContext) => {
    try {
      const metric = ctx._httpMetric as
        | ReturnType<typeof httpMetric>
        | undefined;
      if (metric) {
        metric.setHttpResponseCode(response.status);
        const contentType = response.headers.get('Content-Type');
        if (contentType) metric.setResponseContentType(contentType);
        await metric.stop();
      }
    } catch (error) {
      console.log('[perf] stop metric error:', error);
    }

    return response;
  }
);

NetworkClient.addErrorInterceptor(
  async (error: unknown, ctx: RequestContext) => {
    try {
      const metric = ctx._httpMetric as
        | ReturnType<typeof httpMetric>
        | undefined;

      let status: number | undefined;
      let contentType: string | undefined;

      if (error instanceof Response) {
        status = error.status;
        contentType = error.headers.get('Content-Type') ?? undefined;
      } else if (
        error != null &&
        typeof (error as Record<string, unknown>).status === 'number'
      ) {
        status = (error as Record<string, unknown>).status as number;
      }

      if (metric) {
        if (status !== undefined) metric.setHttpResponseCode(status);
        if (contentType) metric.setResponseContentType(contentType);
        await metric.stop();
      }

      if ((ctx.isAutoTrackingError as boolean | undefined) ?? true) {
        const label = `${ctx.url.replace(/\/\d+$/, '')} --- ${
          error instanceof Error ? error.message : String(error)
        }`;
        const crashlytics = getCrashlytics();
        log(crashlytics, label);
        recordError(crashlytics, new Error(label));
      }

      if (status === 401) {
        MyEventEmitter.emit('serverUnAuthorized');
      }
    } catch (_error) {
      console.log('[interceptor] error handler threw:', _error);
    }

    throw error;
  }
);

networkRegisterBuilder(NetworkClient);

export default NetworkClient;
