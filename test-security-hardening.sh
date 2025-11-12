#!/bin/bash

echo "🔒 Constella Security Hardening Validation"
echo "==========================================="

# Test 1: Check for strong secrets
echo "Test 1: Validating strong secrets..."
if grep -q "NEO4J_PASSWORD=" .env.production && ! grep -q "NEO4J_AUTH=none" docker-compose.dev.yml; then
    echo "✅ Neo4j authentication enabled"
else
    echo "❌ Neo4j authentication weak"
fi

if grep -q "GRAFANA_PASSWORD=" .env.production && ! grep -q "GF_SECURITY_ADMIN_PASSWORD=admin" docker-compose.dev.yml; then
    echo "✅ Grafana password secured"
else
    echo "❌ Grafana password weak"
fi

if grep -q "JWT_SECRET=" .env.production && ! grep -q "dev-fallback-secret" .env.production; then
    echo "✅ JWT secret is strong"
else
    echo "❌ JWT secret is weak"
fi

# Test 2: Check CORS configuration
echo -e "\nTest 2: Validating CORS configuration..."
if grep -q "CORS_ORIGINS=" .env.production && ! grep -q "\*" .env.production; then
    echo "✅ CORS origins properly restricted"
else
    echo "❌ CORS configuration may be insecure"
fi

# Test 3: Check metrics protection
echo -e "\nTest 3: Validating metrics protection..."
if grep -q "METRICS_AUTH_REQUIRED=true" .env.production; then
    echo "✅ Metrics endpoint protected"
else
    echo "❌ Metrics endpoint not protected"
fi

# Test 4: Check for syntax issues
echo -e "\nTest 4: Validating Python syntax..."
if python3 -m py_compile services/orchestrator-py/main.py 2>/dev/null; then
    echo "✅ Orchestrator Python syntax valid"
else
    echo "❌ Orchestrator Python syntax errors"
fi

echo -e "\n🏁 Security validation complete"
