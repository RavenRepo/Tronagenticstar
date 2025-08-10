# Gap 1: Unified API Gateway Implementation

## Problem Statement

Currently, AgentForge lacks a unified API gateway that provides:
- Consistent external API surface for clients
- Authentication and authorization
- Rate limiting and traffic management
- Request/response transformation
- Service discovery and load balancing

## Current State Analysis

**Existing Components:**
- Basic Express server in `packages/orchestrator/src/server.ts`
- Direct service-to-service communication
- No centralized API management
- Limited authentication/authorization

**Identified Issues:**
- VS Code extension hits orchestrator directly
- No API versioning strategy
- Missing authentication layer
- No rate limiting or throttling
- No request/response validation

## Technical Architecture

### 1. API Gateway Service

```typescript
// New service: services/api-gateway/
├── src/
│   ├── gateway.ts          // Main gateway server
│   ├── middleware/
│   │   ├── auth.ts         // JWT/API key validation
│   │   ├── rateLimit.ts    // Request throttling
│   │   ├── validation.ts   // Request/response validation
│   │   └── logging.ts      // Request logging
│   ├── routes/
│   │   ├── v1/             // API v1 routes
│   │   │   ├── agents.ts   // Agent management
│   │   │   ├── tasks.ts    // Task execution
│   │   │   ├── analytics.ts // Metrics and monitoring
│   │   │   └── health.ts   // Health checks
│   │   └── internal/       // Internal service routes
│   ├── services/
│   │   ├── discovery.ts    // Service discovery
│   │   ├── loadBalancer.ts // Load balancing
│   │   └── circuit.ts      // Circuit breaker
│   └── config/
│       ├── routes.yaml     // Route configuration
│       └── policies.yaml   // Security policies
```

### 2. Service Discovery

```yaml
# services.yaml
services:
  orchestrator:
    url: "http://orchestrator:3000"
    health: "/health"
    weight: 100
  
  embedding:
    url: "http://embedding:8000"
    health: "/health"
    weight: 100
    
  retriever:
    url: "http://retriever:8000"
    health: "/health"
    weight: 100
```

### 3. API Specification

```yaml
# openapi.yaml
openapi: 3.0.3
info:
  title: AgentForge API
  version: 1.0.0
  description: Unified API for AgentForge multi-agent system

paths:
  /v1/agents:
    get:
      summary: List all available agents
      security:
        - ApiKeyAuth: []
      responses:
        200:
          description: List of agents
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Agent'
  
  /v1/agents/{agentId}/trigger:
    post:
      summary: Execute agent task
      security:
        - ApiKeyAuth: []
      parameters:
        - name: agentId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TaskRequest'
      responses:
        200:
          description: Task execution result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TaskResult'

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
    
  schemas:
    Agent:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        specialization:
          type: string
        status:
          type: string
          enum: [ready, busy, degraded, unavailable]
    
    TaskRequest:
      type: object
      properties:
        action:
          type: string
        parameters:
          type: object
    
    TaskResult:
      type: object
      properties:
        success:
          type: boolean
        result:
          type: object
        metadata:
          type: object
```

## Implementation Plan

### Week 1: Gateway Foundation

**Day 1-2: Project Setup**
```bash
# Create gateway service
mkdir -p services/api-gateway
cd services/api-gateway
npm init -y
npm install express cors helmet morgan compression
npm install --save-dev @types/express typescript ts-node
```

**Day 3-4: Core Gateway**
- Implement basic Express gateway server
- Add middleware pipeline (auth, logging, validation)
- Set up service discovery mechanism
- Configure basic routing

**Day 5: Authentication & Security**
- Implement JWT/API key authentication
- Add rate limiting middleware
- Set up CORS and security headers
- Configure request validation

### Week 2: Advanced Features

**Day 1-2: Load Balancing**
- Implement service health checking
- Add round-robin load balancing
- Set up circuit breaker pattern
- Configure failover mechanisms

**Day 3-4: API Management**
- Create OpenAPI specification
- Implement request/response transformation
- Add API versioning support
- Set up response caching

**Day 5: Testing & Documentation**
- Write comprehensive unit tests
- Create integration tests
- Generate API documentation
- Set up monitoring dashboards

### Week 3: Integration & Deployment

**Day 1-2: Service Integration**
- Update orchestrator to register with gateway
- Modify Python services for gateway communication
- Update VS Code extension to use gateway endpoints
- Test end-to-end flows

**Day 3-4: Deployment**
- Create Dockerfile for gateway
- Update docker-compose configuration
- Set up Kubernetes manifests
- Configure ingress and load balancer

**Day 5: Production Readiness**
- Add comprehensive logging and monitoring
- Set up alerting for critical failures
- Performance testing and optimization
- Security audit and penetration testing

## Technical Specifications

### 1. Gateway Server Implementation

```typescript
// src/gateway.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { validationMiddleware } from './middleware/validation';
import { ServiceDiscovery } from './services/discovery';
import { LoadBalancer } from './services/loadBalancer';

export class APIGateway {
  private app: express.Application;
  private discovery: ServiceDiscovery;
  private loadBalancer: LoadBalancer;

  constructor() {
    this.app = express();
    this.discovery = new ServiceDiscovery();
    this.loadBalancer = new LoadBalancer(this.discovery);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(authMiddleware);
    this.app.use(rateLimitMiddleware);
    this.app.use(validationMiddleware);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API v1 routes
    this.app.use('/v1', this.createV1Router());
  }

  private createV1Router(): express.Router {
    const router = express.Router();

    // Proxy to orchestrator
    router.all('/agents/*', this.proxyToService('orchestrator'));
    router.all('/tasks/*', this.proxyToService('orchestrator'));
    
    // Proxy to specialized services
    router.all('/embedding/*', this.proxyToService('embedding'));
    router.all('/retrieval/*', this.proxyToService('retriever'));

    return router;
  }

  private proxyToService(serviceName: string) {
    return async (req: express.Request, res: express.Response) => {
      try {
        const serviceUrl = await this.loadBalancer.getServiceUrl(serviceName);
        const response = await this.forwardRequest(serviceUrl, req);
        
        res.status(response.status).json(response.data);
      } catch (error) {
        res.status(500).json({ 
          error: 'Service unavailable',
          service: serviceName 
        });
      }
    };
  }

  async start(port: number = 8080): Promise<void> {
    await this.discovery.start();
    
    this.app.listen(port, () => {
      console.log(`API Gateway listening on port ${port}`);
    });
  }
}
```

### 2. Authentication Middleware

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
  user?: {
    id: string;
    permissions: string[];
  };
}

export function authMiddleware(
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): void {
  // Skip auth for health checks
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization;

  if (apiKey) {
    // API Key authentication
    if (validateApiKey(apiKey)) {
      req.user = { id: 'api-user', permissions: ['read', 'write'] };
      return next();
    }
  } else if (authHeader?.startsWith('Bearer ')) {
    // JWT authentication
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = payload;
      return next();
    } catch (error) {
      // Invalid token
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}

function validateApiKey(apiKey: string): boolean {
  // Implement API key validation logic
  const validKeys = process.env.API_KEYS?.split(',') || [];
  return validKeys.includes(apiKey);
}
```

### 3. Rate Limiting

```typescript
// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const rateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'agentforge:ratelimit:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

## Testing Strategy

### 1. Unit Tests
```typescript
// tests/gateway.test.ts
describe('API Gateway', () => {
  let gateway: APIGateway;
  
  beforeEach(() => {
    gateway = new APIGateway();
  });

  describe('Authentication', () => {
    it('should accept valid API key', async () => {
      const response = await request(gateway.app)
        .get('/v1/agents')
        .set('X-API-Key', 'valid-api-key')
        .expect(200);
    });

    it('should reject invalid API key', async () => {
      await request(gateway.app)
        .get('/v1/agents')
        .set('X-API-Key', 'invalid-key')
        .expect(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make requests up to limit
      for (let i = 0; i < 1000; i++) {
        await request(gateway.app)
          .get('/health')
          .expect(200);
      }

      // Next request should be rate limited
      await request(gateway.app)
        .get('/health')
        .expect(429);
    });
  });
});
```

### 2. Integration Tests
```typescript
// tests/integration.test.ts
describe('Gateway Integration', () => {
  it('should proxy requests to orchestrator', async () => {
    const response = await request(gateway.app)
      .get('/v1/agents')
      .set('X-API-Key', 'valid-key')
      .expect(200);

    expect(response.body).toHaveProperty('agents');
  });

  it('should handle service failures gracefully', async () => {
    // Simulate service down
    await stopService('orchestrator');

    const response = await request(gateway.app)
      .get('/v1/agents')
      .set('X-API-Key', 'valid-key')
      .expect(500);

    expect(response.body.error).toBe('Service unavailable');
  });
});
```

## Monitoring & Observability

### 1. Metrics Collection
```typescript
// src/middleware/metrics.ts
import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram } from 'prom-client';

const requestCounter = new Counter({
  name: 'gateway_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'route', 'status'],
});

const requestDuration = new Histogram({
  name: 'gateway_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'route'],
});

export function metricsMiddleware(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    requestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode.toString(),
    });

    requestDuration.observe(
      { method: req.method, route: req.route?.path || req.path },
      duration
    );
  });

  next();
}
```

### 2. Health Checks
```typescript
// src/health.ts
export class HealthChecker {
  async checkOverallHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkServices(),
    ]);

    const failures = checks.filter(check => check.status === 'rejected');
    
    return {
      status: failures.length === 0 ? 'healthy' : 'degraded',
      checks: {
        database: checks[0].status === 'fulfilled',
        redis: checks[1].status === 'fulfilled',
        services: checks[2].status === 'fulfilled',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
```

## Deployment Configuration

### 1. Dockerfile
```dockerfile
# services/api-gateway/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/gateway.js"]
```

### 2. Kubernetes Manifests
```yaml
# k8s/api-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: agentforge/api-gateway:latest
        ports:
        - containerPort: 8080
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        - name: API_KEYS
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: api-keys
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.agentforge.com
    secretName: api-gateway-tls
  rules:
  - host: api.agentforge.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
```

## Success Criteria

### Functional Requirements
- ✅ All external API calls go through the gateway
- ✅ Authentication and authorization working
- ✅ Rate limiting implemented and tested
- ✅ Service discovery and load balancing operational
- ✅ Request/response validation in place

### Non-Functional Requirements
- ✅ 99.9% uptime SLA
- ✅ <100ms response time (p95)
- ✅ Handle 10,000 requests/minute
- ✅ Automatic failover and recovery
- ✅ Comprehensive monitoring and alerting

### Security Requirements
- ✅ All endpoints require authentication
- ✅ API keys and JWTs properly validated
- ✅ Rate limiting prevents abuse
- ✅ Request validation prevents injection attacks
- ✅ Security headers properly configured

## Migration Strategy

### Phase 1: Parallel Deployment
- Deploy gateway alongside existing services
- Configure gateway to proxy to current endpoints
- Test gateway with subset of traffic

### Phase 2: Client Migration
- Update VS Code extension to use gateway
- Migrate web dashboard to gateway endpoints
- Update internal service-to-service calls

### Phase 3: Cutover
- Route all external traffic through gateway
- Disable direct access to internal services
- Monitor and optimize performance

### Phase 4: Cleanup
- Remove unused direct endpoints
- Optimize gateway configuration
- Document new API patterns

---

**Implementation Owner**: Backend Team  
**Estimated Effort**: 3 weeks  
**Dependencies**: None  
**Risk Level**: Medium  
**Success Metrics**: API response time <100ms, 99.9% uptime, zero security incidents