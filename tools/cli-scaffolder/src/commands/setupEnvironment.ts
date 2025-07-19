import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

export interface SetupOptions {
  docker: boolean;
  local: boolean;
  prod: boolean;
}

export async function setupEnvironment(options: SetupOptions): Promise<void> {
  const spinner = ora('Setting up AgentForge development environment...').start();

  try {
    // Determine setup type
    let setupType = 'local';
    if (options.docker) setupType = 'docker';
    if (options.prod) setupType = 'production';

    if (!options.docker && !options.local && !options.prod) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'setupType',
          message: 'Select setup type:',
          choices: [
            { name: 'Local Development', value: 'local' },
            { name: 'Docker Development', value: 'docker' },
            { name: 'Production', value: 'production' }
          ]
        }
      ]);
      setupType = answers.setupType;
    }

    spinner.text = `Setting up ${setupType} environment...`;

    switch (setupType) {
      case 'docker':
        await setupDockerEnvironment(spinner);
        break;
      case 'production':
        await setupProductionEnvironment(spinner);
        break;
      default:
        await setupLocalEnvironment(spinner);
        break;
    }

    spinner.succeed(chalk.green(`${setupType} environment setup completed!`));
    
    // Show next steps
    console.log(chalk.cyan('\\nNext steps:'));
    if (setupType === 'docker') {
      console.log(chalk.gray('  1. docker-compose up -d'));
      console.log(chalk.gray('  2. Open http://localhost:3000'));
    } else if (setupType === 'production') {
      console.log(chalk.gray('  1. Review production configuration'));
      console.log(chalk.gray('  2. Set up monitoring and logging'));
      console.log(chalk.gray('  3. Configure SSL certificates'));
    } else {
      console.log(chalk.gray('  1. npm install'));
      console.log(chalk.gray('  2. npm run dev'));
      console.log(chalk.gray('  3. Install AgentForge VS Code extension'));
    }

  } catch (error) {
    spinner.fail(chalk.red('Failed to setup environment'));
    console.error(error);
    process.exit(1);
  }
}

async function setupLocalEnvironment(spinner: any): Promise<void> {
  spinner.text = 'Setting up local development environment...';

  // Check for required tools
  const requiredTools = ['node', 'npm', 'git'];
  const missingTools = [];

  for (const tool of requiredTools) {
    try {
      execSync(\`\${tool} --version\`, { stdio: 'pipe' });
    } catch {
      missingTools.push(tool);
    }
  }

  if (missingTools.length > 0) {
    throw new Error(\`Missing required tools: \${missingTools.join(', ')}\`);
  }

  // Create local configuration files
  const configDir = path.join(process.cwd(), 'config');
  await fs.ensureDir(configDir);

  // Local Redis setup instructions
  const redisSetup = \`# Redis Setup for Local Development

## Option 1: Install Redis locally
\\\`\\\`\\\`bash
# macOS (using Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis

# Windows (using WSL or download from Redis website)
# https://redis.io/download
\\\`\\\`\\\`

## Option 2: Use Docker for Redis only
\\\`\\\`\\\`bash
docker run -d -p 6379:6379 --name agentforge-redis redis:7-alpine
\\\`\\\`\\\`

## Test Redis connection
\\\`\\\`\\\`bash
redis-cli ping
# Should return: PONG
\\\`\\\`\\\`
\`;

  await fs.writeFile(path.join(process.cwd(), 'REDIS_SETUP.md'), redisSetup);

  // Create local environment file
  const envLocal = \`# Local Development Environment
NODE_ENV=development
PORT=3000
HOST=localhost

# Redis (local)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug

# AgentForge Configuration
AGENTFORGE_API_KEY=dev-api-key
AGENTFORGE_ORCHESTRATOR_URL=http://localhost:3000

# Development flags
ENABLE_DEBUG=true
HOT_RELOAD=true
\`;

  await fs.writeFile(path.join(process.cwd(), '.env.local'), envLocal);

  spinner.text = 'Creating development scripts...';

  // Create development package.json scripts if not exists
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJSON(packageJsonPath);
    
    packageJson.scripts = {
      ...packageJson.scripts,
      'dev:setup': 'npm install && npm run build',
      'dev:redis': 'redis-server',
      'dev:all': 'concurrently "npm run dev:redis" "npm run dev"',
      'debug': 'NODE_ENV=development DEBUG=* npm run dev'
    };

    if (!packageJson.devDependencies?.concurrently) {
      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        concurrently: '^8.2.2'
      };
    }

    await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
  }
}

async function setupDockerEnvironment(spinner: any): Promise<void> {
  spinner.text = 'Setting up Docker development environment...';

  // Check for Docker
  try {
    execSync('docker --version', { stdio: 'pipe' });
    execSync('docker-compose --version', { stdio: 'pipe' });
  } catch {
    throw new Error('Docker and Docker Compose are required for Docker setup');
  }

  // Create comprehensive docker-compose.dev.yml
  const dockerComposeDev = \`version: '3.8'

services:
  orchestrator:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=debug
    volumes:
      - ./src:/app/src
      - ./config:/app/config
    depends_on:
      - redis
      - prometheus
      - grafana
    networks:
      - agentforge-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - agentforge-network

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - agentforge-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./config/grafana:/etc/grafana/provisioning
    networks:
      - agentforge-network

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "14268:14268"
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    networks:
      - agentforge-network

volumes:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  agentforge-network:
    driver: bridge
\`;

  await fs.writeFile(path.join(process.cwd(), 'docker-compose.dev.yml'), dockerComposeDev);

  // Create development Dockerfile
  const dockerfileDev = \`FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Development command with hot reload
CMD ["npm", "run", "dev"]
\`;

  await fs.writeFile(path.join(process.cwd(), 'Dockerfile.dev'), dockerfileDev);

  // Create development scripts
  const devScripts = \`#!/bin/bash

# Development helper scripts for AgentForge

# Start all services
start_all() {
    echo "Starting AgentForge development environment..."
    docker-compose -f docker-compose.dev.yml up -d
    echo "Services started! Check:"
    echo "- Orchestrator: http://localhost:3000"
    echo "- Grafana: http://localhost:3001 (admin/admin)"
    echo "- Prometheus: http://localhost:9090"
    echo "- Jaeger: http://localhost:16686"
}

# Stop all services
stop_all() {
    echo "Stopping AgentForge development environment..."
    docker-compose -f docker-compose.dev.yml down
}

# View logs
logs() {
    docker-compose -f docker-compose.dev.yml logs -f \$1
}

# Restart service
restart() {
    echo "Restarting \$1..."
    docker-compose -f docker-compose.dev.yml restart \$1
}

# Show usage
usage() {
    echo "Usage: \$0 {start|stop|logs|restart|status}"
    echo "  start  - Start all services"
    echo "  stop   - Stop all services"
    echo "  logs   - Show logs (optional service name)"
    echo "  restart - Restart service (service name required)"
}

case "\$1" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    logs)
        logs \$2
        ;;
    restart)
        restart \$2
        ;;
    *)
        usage
        exit 1
        ;;
esac
\`;

  await fs.writeFile(path.join(process.cwd(), 'dev-tools.sh'), devScripts);
  await fs.chmod(path.join(process.cwd(), 'dev-tools.sh'), '755');
}

async function setupProductionEnvironment(spinner: any): Promise<void> {
  spinner.text = 'Setting up production environment...';

  // Create production configuration
  const prodConfig = {
    orchestrator: {
      port: process.env.PORT || 3000,
      host: '0.0.0.0',
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
        credentials: true
      }
    },
    agents: {
      autoRegister: true,
      maxConcurrent: 50,
      timeout: 60000
    },
    memory: {
      type: 'redis',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      cluster: process.env.REDIS_CLUSTER === 'true'
    },
    logging: {
      level: 'info',
      format: 'json'
    },
    security: {
      apiKey: process.env.AGENTFORGE_API_KEY,
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
      }
    },
    monitoring: {
      prometheus: {
        enabled: true,
        port: 9090
      },
      jaeger: {
        enabled: true,
        endpoint: process.env.JAEGER_ENDPOINT
      }
    }
  };

  await fs.writeJSON(path.join(process.cwd(), 'config/production.json'), prodConfig, { spaces: 2 });

  // Create production Dockerfile
  const prodDockerfile = \`# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agentforge -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=agentforge:nodejs /app/dist ./dist
COPY --from=builder --chown=agentforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agentforge:nodejs /app/package.json ./package.json
COPY --from=builder --chown=agentforge:nodejs /app/config ./config

# Switch to non-root user
USER agentforge

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node dist/healthcheck.js

# Start application
CMD ["node", "dist/index.js"]
\`;

  await fs.writeFile(path.join(process.cwd(), 'Dockerfile.prod'), prodDockerfile);

  // Create production docker-compose
  const prodDockerCompose = \`version: '3.8'

services:
  orchestrator:
    build:
      context: .
      dockerfile: Dockerfile.prod
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=\${REDIS_URL}
      - AGENTFORGE_API_KEY=\${AGENTFORGE_API_KEY}
    restart: unless-stopped
    depends_on:
      - redis
    networks:
      - agentforge-prod

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - agentforge-prod

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    restart: unless-stopped
    depends_on:
      - orchestrator
    networks:
      - agentforge-prod

volumes:
  redis_data:

networks:
  agentforge-prod:
    driver: bridge
\`;

  await fs.writeFile(path.join(process.cwd(), 'docker-compose.prod.yml'), prodDockerCompose);

  // Create health check script
  const healthCheck = \`import http from 'http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  timeout: 2000,
};

const request = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', () => {
  process.exit(1);
});

request.end();
\`;

  await fs.writeFile(path.join(process.cwd(), 'src/healthcheck.js'), healthCheck);

  // Create production environment template
  const prodEnv = \`# Production Environment Configuration
NODE_ENV=production
PORT=3000

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_CLUSTER=false

# Security
AGENTFORGE_API_KEY=your-secure-api-key-here
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Monitoring
JAEGER_ENDPOINT=http://jaeger:14268/api/traces

# Logging
LOG_LEVEL=info

# SSL (for nginx)
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem
\`;

  await fs.writeFile(path.join(process.cwd(), '.env.production'), prodEnv);
}
