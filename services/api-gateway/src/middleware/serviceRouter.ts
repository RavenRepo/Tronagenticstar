import { Request, Response, NextFunction, RequestHandler } from 'express';
import { serviceRegistry } from '../services/ServiceRegistry';
import { logger } from '../utils/logger';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export class ServiceRouter {
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
      },
    });
  }

  public route(serviceName: string): RequestHandler {
    const handler = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const service = serviceRegistry.getService(serviceName);
      
      if (!service) {
        res.status(503).json({
          error: 'Service unavailable',
          message: `No healthy instances of ${serviceName} available`,
        });
        return;
      }

      try {
        // Prepare the request to the target service
        const targetUrl = this.buildTargetUrl(service.url, req.originalUrl);
        const requestConfig: AxiosRequestConfig = {
          method: req.method as any,
          url: targetUrl,
          data: req.body,
          headers: this.filterHeaders(req.headers),
          params: req.query,
          responseType: 'stream',
          validateStatus: () => true, // We'll handle all status codes
        };

        logger.info(`Proxying request to ${service.name}`, {
          method: req.method,
          originalUrl: req.originalUrl,
          targetUrl,
          serviceId: service.id,
        });

        // Forward the request to the target service
        const response = await this.httpClient.request(requestConfig);

        // Forward the response from the target service to the client
        res.status(response.status);
        
        // Copy headers from the target service response to the client response
        Object.entries(response.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });
        
        // Pipe the response data
        response.data.pipe(res);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error forwarding request to service', {
          serviceName,
          error: err.message,
          stack: err.stack,
        });
        
        if (!res.headersSent) {
          res.status(502).json({
            error: 'Bad Gateway',
            message: `Error forwarding request to ${serviceName}`,
          });
        }
      }
    };
    return handler;
  }

  private buildTargetUrl(baseUrl: string, originalUrl: string): string {
    // Remove the API version prefix if present
    const urlWithoutPrefix = originalUrl.replace(/^\/api\/v\d+\//, '/');
    // Remove any leading slashes from the path
    const path = urlWithoutPrefix.replace(/^\/+/, '');
    // Ensure the base URL ends with a single slash
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    
    return `${normalizedBaseUrl}${path}`;
  }

  private filterHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    const excludedHeaders = [
      'host',
      'connection',
      'content-length',
      'accept-encoding',
      'cookie',
    ];

    for (const [key, value] of Object.entries(headers)) {
      if (!excludedHeaders.includes(key.toLowerCase()) && value !== undefined) {
        result[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    return result;
  }
}

export const serviceRouter = new ServiceRouter();
