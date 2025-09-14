# 🚀 Constella API Gateway

The **Constella API Gateway** is the unified entry point for the Constella Multi-Agent AI Platform. It provides authentication, rate limiting, service discovery, load balancing, and intelligent routing to all backend microservices and AI agents.

## 🎯 Overview

The API Gateway serves as the central hub that:

- **Unifies Access**: Single endpoint for all Constella services and AI agents
- **Handles Authentication**: JWT and API key authentication with role-based permissions
- **Manages Rate Limiting**: Intelligent rate limiting with Redis backend
- **Discovers Services**: Automatic service discovery and health monitoring
- **Routes Intelligently**: Load balancing and failover to healthy services
- **Monitors Performance**: Prometheus metrics and comprehensive logging
- **Ensures Security**: CORS, security headers, and request validation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Constella API Gateway                    │
├─────────────────────────────────────────────────────────────┤
│  Authentication │ Rate Limiting │ Service Discovery │ CORS  │
├─────────────────────────────────────────────────────────────┤
│                     Load Balancer                          │
├─────────────────────────────────────────────────────────────┤
│   Orchestrator  │  DesignForge  │  SecuriShield  │  ...    │
│   (TypeScript)  │   (Python)    │   (Python)     │         │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **Express.js Server**: High-performance HTTP server with TypeScript
- **Service Discovery**: Automatic detection and health monitoring of backend services
- **Load Balancer**: Multiple strategies (round-robin, weighted, least connections)
- **Authentication Middleware**: JWT and API key support with permissions
- **Rate Limiting**: Redis-backed with per-user/API key limits
- **Proxy Engine**: Intelligent request forwarding with retries and failover
- **Monitoring**: Prometheus metrics, structured logging, health checks

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **npm** or **pnpm**
- **Redis** (optional, for distributed rate limiting)
- **Docker** (optional, for containerized deployment)

### Installation

1. **Clone and navigate to the API Gateway directory:**
   ```bash
   cd Tronagenticstar-master/services/api-gateway
   ```

2. **Run the automated setup:**
   ```bash
   chmod +x setup.sh
   ./setup.sh install
   ```

3. **Start the development server:**
   ```bash
   ./setup.sh dev
   ```

The API Gateway will be available at: **http://localhost:3000**

### Manual Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Server Configuration
API_GATEWAY_PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-secure-jwt-secret
API_KEYS={"dev-key":"..."}

# Redis (for rate limiting)
REDIS_HOST=localhost
REDIS_PORT=6379

# Service URLs
ORCHESTRATOR_URL=http://localhost:3001
DESIGNFORGE_URL=http://localhost:8003
SECURISHIELD_URL=http://localhost:8004
```

### Service Discovery

Services are automatically discovered through health checks. Configure service endpoints in your `.env`:

```bash
# Each service needs URL, timeout, and retry configuration
ORCHESTRATOR_URL=http://localhost:3001
ORCHESTRATOR_TIMEOUT=30000
ORCHESTRATOR_RETRY_ATTEMPTS=3
```

## 📡 API Reference

### Base URL
```
http://localhost:3000
```

### Authentication

The API Gateway supports two authentication methods:

#### 1. API Key Authentication
```bash
curl -H "X-API-Key: dev-key-12345" http://localhost:3000/v1/agents
```

#### 2. JWT Authentication
```bash
curl -H "Authorization: Bearer <jwt-token>" http://localhost:3000/v1/agents
```

### Core Endpoints

#### Health Check
```http
GET /health
```
Returns gateway and services health status.

#### Gateway Status
```http
GET /v1/status
```
Returns detailed gateway and service information.

#### List Agents
```http
GET /v1/agents
```
Returns all discovered AI agents.

#### Trigger Agent
```http
POST /v1/agents/{agentId}/trigger
Content-Type: application/json

{
  "action": "analyze",
  "parameters": {
    "code": "function hello() { return 'world'; }"
  }
}
```

#### Service Proxy
```http
GET /v1/services/{serviceName}/any/path
POST /v1/services/{serviceName}/any/endpoint
```
Proxy requests directly to backend services.

#### Metrics (Prometheus)
```http
GET /metrics
```
Returns Prometheus-format metrics.

## 🔐 Authentication & Authorization

### JWT Tokens

For development, generate test tokens:

```bash
curl http://localhost:3000/dev/tokens
```

Response:
```json
{
  "admin": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### API Keys

Configure API keys in your `.env` file:

```bash
API_KEYS={"your-api-key":{"id":"key-1","name":"My Key","permissions":["*"],"rateLimit":1000,"active":true}}
```

### Permissions

The gateway supports fine-grained permissions:

- `*`: Full access
- `agents:read`: List and view agents
- `agents:trigger`: Execute agent tasks
- `services:proxy`: Access service proxy endpoints
- `admin:*`: Administrative functions

## ⚡ Rate Limiting

### Configuration

Rate limiting is configurable per user/API key:

```bash
RATE_LIMIT_WINDOW_MS=60000    # 1 minute window
RATE_LIMIT_MAX_REQUESTS=100   # 100 requests per window
```

### API Key-Specific Limits

```json
{
  "your-api-key": {
    "rateLimit": 1000,
    "dailyLimit": 10000
  }
}
```

### Response Headers

Rate limit information is returned in headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 🔍 Service Discovery

The gateway automatically discovers and monitors backend services:

### Health Checks

- **Interval**: 30 seconds (configurable)
- **Timeout**: 5 seconds (configurable)
- **Endpoint**: `/health` (configurable per service)

### Load Balancing Strategies

1. **Weighted** (default): Route based on service weights
2. **Round Robin**: Evenly distribute requests
3. **Least Connections**: Route to service with fewest active connections
4. **Response Time**: Route to fastest responding service

### Service Status

Check service discovery status:

```bash
curl http://localhost:3000/dev/services
```

## 📊 Monitoring

### Prometheus Metrics

The gateway exports comprehensive metrics:

- **HTTP requests**: Total, duration, status codes
- **Service health**: Uptime and response times
- **Authentication**: Success/failure rates
- **Rate limiting**: Hits and blocks
- **Agent requests**: Performance and errors

Access metrics at: `http://localhost:3000/metrics`

### Logging

Structured JSON logging with Winston:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "HTTP Request",
  "requestId": "req-123",
  "method": "GET",
  "url": "/v1/agents",
  "statusCode": 200,
  "responseTime": 45
}
```

### Health Checks

Comprehensive health endpoint:

```bash
curl http://localhost:3000/health
```

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
# Start all services
./setup.sh docker

# Or manually
docker-compose up -d
```

Services started:
- **API Gateway**: `http://localhost:3000`
- **Redis**: `localhost:6379`
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001` (admin/admin)

### Production Docker

```bash
# Build production image
docker build -t constella/api-gateway .

# Run production container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secure-secret \
  constella/api-gateway
```

## 🧪 Testing

### Automated Tests

```bash
# Run all tests
npm test

# Run gateway functionality tests
node test-gateway.js

# Run with verbose output
node test-gateway.js --verbose
```

### Manual Testing

#### 1. Health Check
```bash
curl http://localhost:3000/health
```

#### 2. Authentication
```bash
curl -H "X-API-Key: dev-key-12345" http://localhost:3000/v1/status
```

#### 3. Agent Listing
```bash
curl -H "X-API-Key: dev-key-12345" http://localhost:3000/v1/agents
```

#### 4. Rate Limiting
```bash
# Send multiple requests quickly
for i in {1..20}; do
  curl -H "X-API-Key: dev-key-12345" http://localhost:3000/v1/status &
done
wait
```

## 🔧 Development

### Project Structure

```
api-gateway/
├── src/
│   ├── config/           # Configuration management
│   ├── middleware/       # Authentication, rate limiting, monitoring
│   ├── services/         # Service discovery, load balancing
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Logging and utilities
│   ├── server.ts        # Main Express server
│   └── index.ts         # Entry point
├── dist/                # Compiled JavaScript (generated)
├── logs/                # Log files (generated)
├── monitoring/          # Prometheus/Grafana configs
├── test-gateway.js      # Test script
├── setup.sh            # Setup and installation script
└── docker-compose.yml   # Development environment
```

### Available Scripts

```bash
# Development
npm run dev           # Start development server with hot reload
npm run build         # Build TypeScript to JavaScript
npm run start         # Start production server

# Testing
npm test              # Run unit tests
npm run test:watch    # Run tests in watch mode
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues

# Docker
npm run docker:build  # Build Docker image
npm run docker:run    # Run Docker container
```

### Adding New Services

1. **Add service configuration** in `.env`:
   ```bash
   MYSERVICE_URL=http://localhost:9001
   MYSERVICE_TIMEOUT=15000
   MYSERVICE_RETRY_ATTEMPTS=2
   ```

2. **Service discovery** will automatically detect the service if it responds to `/health`

3. **Custom agent discovery**: Services can provide `/agents` endpoint to register custom agents

### Extending Middleware

```typescript
// src/middleware/custom.ts
export function customMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Your custom logic here
    next();
  };
}
```

## 📈 Performance

### Benchmarks

Typical performance metrics:

- **Throughput**: 5,000+ requests/second
- **Latency**: <100ms average response time
- **Memory**: ~150MB baseline memory usage
- **CPU**: <5% during normal operation

### Optimization Tips

1. **Enable Redis**: For distributed rate limiting and caching
2. **Tune Connection Pool**: Adjust HTTP agent settings for backend services
3. **Configure Load Balancing**: Use response-time strategy for optimal routing
4. **Monitor Metrics**: Use Prometheus and Grafana for performance insights

## 🚨 Troubleshooting

### Common Issues

#### Gateway Won't Start
```bash
# Check if port is in use
lsof -i :3000

# Check environment configuration
cat .env

# Check logs
tail -f logs/combined.log
```

#### Services Not Discovered
```bash
# Check service URLs are accessible
curl http://localhost:3001/health

# Check service discovery status
curl http://localhost:3000/dev/services
```

#### Authentication Issues
```bash
# Verify API key configuration
echo $API_KEYS

# Generate test tokens
curl http://localhost:3000/dev/tokens
```

#### Rate Limiting Too Aggressive
```bash
# Check current limits
grep RATE_LIMIT .env

# Clear rate limits (if using Redis)
redis-cli flushdb
```

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Health Check Failures

If services are marked as unhealthy:

1. **Verify service is running** on configured port
2. **Check health endpoint** returns 200 status
3. **Review network connectivity** between services
4. **Check service logs** for errors

## 🔒 Security

### Production Security Checklist

- [ ] **Change default JWT secret** to secure random value
- [ ] **Configure CORS origins** for your domain only
- [ ] **Use HTTPS** in production
- [ ] **Implement proper API key management** (not in environment variables)
- [ ] **Enable rate limiting** with appropriate limits
- [ ] **Review security headers** configuration
- [ ] **Monitor for suspicious activity** in logs
- [ ] **Regular security updates** for dependencies

### Security Features

- **CORS Protection**: Configurable origins and headers
- **Security Headers**: Helmet.js with CSP, HSTS, etc.
- **Input Validation**: Request sanitization and validation
- **Rate Limiting**: Protection against brute force and DDoS
- **Authentication Logging**: All auth attempts are logged
- **IP-based Blocking**: Can be extended for suspicious IP addresses

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow TypeScript conventions** and pass linting
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Submit a pull request**

### Code Standards

- **TypeScript strict mode** enabled
- **ESLint + Prettier** for code formatting
- **Jest** for unit testing
- **Structured logging** for all operations
- **Comprehensive error handling** with proper HTTP status codes

## 📄 License

This project is part of the Constella Multi-Agent AI Platform. See the main repository for license information.

## 🆘 Support

- **Issues**: GitHub Issues in the main repository
- **Documentation**: See `/docs` in the main repository
- **Community**: Join our Discord server for support and discussions

---

**Constella API Gateway** - Unified access to the future of AI-powered development tools.

Built with ❤️ by the Constella team.