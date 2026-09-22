import { APIRequestContext, APIResponse, request } from '@playwright/test';

// Ensure Node allows corporate self-signed / inspection certificates if native fetch is used
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export interface ApiRequestOptions {
  pathParams?: Record<string, string | number>;
  queryParams?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  data?: any;
  timeout?: number;
  retries?: number;
}

export interface ApiResponseData {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  durationMs: number;
}

export class ApiClient {
  private requestContext?: APIRequestContext;

  constructor(requestContext?: APIRequestContext) {
    this.requestContext = requestContext;
  }

  /**
   * Initializes a corporate-grade APIRequestContext:
   * 1. Bypasses SSL inspection (Zscaler, Netskope, Palo Alto) via ignoreHTTPSErrors.
   * 2. Automatically picks up corporate proxy (HTTPS_PROXY / HTTP_PROXY) and respects NO_PROXY.
   * 3. Sends modern enterprise Chrome User-Agent to avoid WAF/Bot-defense blocks.
   */
  private async getContext(targetUrl?: string): Promise<APIRequestContext> {
    if (!this.requestContext) {
      const proxyServer = this.resolveProxyServer(targetUrl);
      const proxyConfig = proxyServer ? { server: proxyServer } : undefined;

      this.requestContext = await request.newContext({
        ignoreHTTPSErrors: true, // Bypass corporate inspection certificates
        proxy: proxyConfig,
        extraHTTPHeaders: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(process.env.API_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.API_AUTH_TOKEN}` } : {}),
          ...(process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {}),
        },
      });
    }
    return this.requestContext;
  }

  /**
   * Checks if a target URL should use the corporate proxy or bypass it based on NO_PROXY.
   */
  private resolveProxyServer(targetUrl?: string): string | undefined {
    const rawProxy =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy;

    if (!rawProxy || !targetUrl) return rawProxy;

    try {
      const hostname = new URL(targetUrl).hostname.toLowerCase();
      const noProxy = process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1';
      const noProxyList = noProxy.split(',').map((item) => item.trim().toLowerCase());

      const shouldBypass = noProxyList.some((rule) => {
        if (!rule) return false;
        if (rule === '*') return true;
        if (rule.startsWith('.')) return hostname.endsWith(rule);
        if (rule.startsWith('*.')) return hostname.endsWith(rule.substring(1));
        return hostname === rule || hostname.endsWith(`.${rule}`);
      });

      return shouldBypass ? undefined : rawProxy;
    } catch {
      return rawProxy;
    }
  }

  /**
   * Interpolate path parameters (e.g. :pathparam or {pathparam}) and append query parameters.
   */
  public buildUrl(
    templateUrl: string,
    pathParams?: Record<string, string | number>,
    queryParams?: Record<string, string | number | boolean>
  ): string {
    let resolvedUrl = templateUrl;

    // Replace :pathparam and {pathparam}
    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        resolvedUrl = resolvedUrl.replace(new RegExp(`:${key}\\b`, 'g'), String(value));
        resolvedUrl = resolvedUrl.replace(new RegExp(`{${key}}`, 'g'), String(value));
      }
    }

    if (queryParams && Object.keys(queryParams).length > 0) {
      const urlObj = new URL(resolvedUrl);
      for (const [key, value] of Object.entries(queryParams)) {
        urlObj.searchParams.set(key, String(value));
      }
      resolvedUrl = urlObj.toString();
    }

    return resolvedUrl;
  }

  public async get(url: string, options: ApiRequestOptions = {}): Promise<ApiResponseData> {
    return this.send('GET', url, options);
  }

  public async post(url: string, options: ApiRequestOptions = {}): Promise<ApiResponseData> {
    return this.send('POST', url, options);
  }

  /**
   * Generic request executor with exponential backoff retry for transient network drops and WAF 429 rate limits.
   */
  public async send(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    templateUrl: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponseData> {
    const finalUrl = this.buildUrl(templateUrl, options.pathParams, options.queryParams);
    const context = await this.getContext(finalUrl);
    const maxRetries = options.retries ?? 2;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const rawResponse = await context.fetch(finalUrl, {
          method,
          headers: options.headers,
          data: options.data,
          timeout: options.timeout ?? 30000,
        });

        const status = rawResponse.status();

        // If rate-limited (429) or transient corporate gateway blip (502, 503, 504), retry with backoff
        if ((status === 429 || status === 502 || status === 503 || status === 504) && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        const durationMs = Date.now() - startTime;
        const statusText = rawResponse.statusText();
        const headers = rawResponse.headers();

        let body: any;
        const contentType = headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            body = await rawResponse.json();
          } catch {
            body = await rawResponse.text();
          }
        } else {
          body = await rawResponse.text();
          try {
            body = JSON.parse(body);
          } catch {
            // keep as text
          }
        }

        return {
          url: finalUrl,
          status,
          statusText,
          headers,
          body,
          durationMs,
        };
      } catch (err: any) {
        lastError = err;
        // Retry on network reset, disconnect, or timeout
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    throw new Error(`API Request failed for [${method}] ${finalUrl} after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }
}
