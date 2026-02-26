/** @type {import('next').NextConfig} */
const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8001";

const nextConfig = {
  // Proxy API requests to the Constella backend services so the dashboard
  // can talk to the gateway and orchestrator without CORS issues in dev.
  async rewrites() {
    return [
      // Gateway API routes — /api/gateway/* → Gateway /v1/*
      {
        source: "/api/gateway/:path*",
        destination: `${GATEWAY_URL}/v1/:path*`,
      },
      // Gateway health — /api/health → Gateway /health
      {
        source: "/api/health",
        destination: `${GATEWAY_URL}/health`,
      },
      // Gateway metrics — /api/metrics → Gateway /metrics
      {
        source: "/api/metrics",
        destination: `${GATEWAY_URL}/metrics`,
      },
      // Orchestrator direct — /api/orchestrator/* → Orchestrator /*
      {
        source: "/api/orchestrator/:path*",
        destination: `${ORCHESTRATOR_URL}/:path*`,
      },
      // Orchestrator analyze — /api/analyze → Orchestrator /analyze
      {
        source: "/api/analyze",
        destination: `${ORCHESTRATOR_URL}/analyze`,
      },
      // Orchestrator agents list — /api/agents → Orchestrator /agents
      {
        source: "/api/agents",
        destination: `${ORCHESTRATOR_URL}/agents`,
      },
      // WebSocket passthrough — /api/ws → Orchestrator /ws
      {
        source: "/api/ws",
        destination: `${ORCHESTRATOR_URL}/ws`,
      },
    ];
  },

  // Allow images from any backend service (health badges, diagrams, etc.)
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,

  // Environment variables exposed to the browser (NEXT_PUBLIC_ prefix)
  env: {
    NEXT_PUBLIC_GATEWAY_URL: GATEWAY_URL,
    NEXT_PUBLIC_ORCHESTRATOR_URL: ORCHESTRATOR_URL,
    NEXT_PUBLIC_APP_NAME: "Constella AI Platform",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },

  // Output as standalone for Docker deployments
  output: "standalone",

  // Custom headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
