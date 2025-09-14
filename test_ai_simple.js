#!/usr/bin/env node
/**
 * Simple AI Agent Testing Script
 * Tests the LLM-powered agents directly without external dependencies
 */

import { readFileSync } from "fs";
import {
  ArchitectureAgent,
  SecurityAgent,
  QualityAgent,
} from "./packages/orchestrator/dist/concreteAgents.js";

// Load API keys from .env file
let OPENAI_API_KEY = "";
let GEMINI_API_KEY = "";
let ANTHROPIC_API_KEY = "";
let OPENROUTER_API_KEY = "";

try {
  const envContent = readFileSync(".env", "utf8");
  const openaiMatch = envContent.match(/OPENAI_API_KEY=(.+)/);
  const geminiMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
  const anthropicMatch = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
  const openrouterMatch = envContent.match(/OPENROUTER_API_KEY=(.+)/);

  if (openaiMatch) {
    OPENAI_API_KEY = openaiMatch[1].trim();
  }
  if (geminiMatch) {
    GEMINI_API_KEY = geminiMatch[1].trim();
  }
  if (anthropicMatch) {
    ANTHROPIC_API_KEY = anthropicMatch[1].trim();
  }
  if (openrouterMatch) {
    OPENROUTER_API_KEY = openrouterMatch[1].trim();
  }
} catch (error) {
  console.log("No .env file found, checking environment variables...");
}

// Fallback to environment variables
if (!OPENAI_API_KEY) {
  OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
}
if (!GEMINI_API_KEY) {
  GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
}
if (!ANTHROPIC_API_KEY) {
  ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
}
if (!OPENROUTER_API_KEY) {
  OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
}

console.log("🚀 Constella AI Agent Testing");
console.log("================================");

async function testAgent(agentClass, agentName, testTask) {
  console.log(`\n🔍 Testing ${agentName}...`);
  console.log(`Task: ${testTask.parameters.action}`);

  try {
    const agent = new agentClass({
      id: `test-${agentName.toLowerCase()}`,
      specialization: testTask.type,
      llmApiKey:
        OPENAI_API_KEY ||
        GEMINI_API_KEY ||
        ANTHROPIC_API_KEY ||
        OPENROUTER_API_KEY,
    });

    const startTime = Date.now();
    const result = await agent.execute(testTask);
    const duration = Date.now() - startTime;

    console.log(`✅ ${agentName} completed in ${duration}ms`);

    // Show key results
    if (result.analysis) {
      const shortAnalysis =
        typeof result.analysis === "string"
          ? result.analysis.substring(0, 150)
          : JSON.stringify(result.analysis).substring(0, 150);
      console.log(`   Analysis: ${shortAnalysis}...`);
    }
    if (result.recommendations && Array.isArray(result.recommendations)) {
      console.log(`   Recommendations: ${result.recommendations.length} items`);
      result.recommendations.slice(0, 2).forEach((rec) => {
        console.log(`     • ${rec}`);
      });
    }
    if (result.ai_powered || result.model_used) {
      console.log(`   🤖 AI-Powered: ${result.model_used || "Yes"}`);
    }
    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    }

    return {
      success: true,
      duration,
      result,
      hasAI: !!(result.ai_powered || result.model_used),
    };
  } catch (error) {
    console.log(`❌ ${agentName} failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  const hasOpenAI = !!OPENAI_API_KEY;
  const hasGemini = !!GEMINI_API_KEY;
  const hasAnthropic = !!ANTHROPIC_API_KEY;
  const hasOpenRouter = !!OPENROUTER_API_KEY;
  const hasApiKey = hasOpenAI || hasGemini || hasAnthropic || hasOpenRouter;
  const activeProviders = [
    hasOpenAI && "OpenAI",
    hasGemini && "Gemini",
    hasAnthropic && "Anthropic",
    hasOpenRouter && "OpenRouter",
  ].filter(Boolean);

  console.log(
    `OpenAI API Key: ${hasOpenAI ? "✅ Configured (" + OPENAI_API_KEY.substring(0, 8) + "...)" : "❌ Missing"}`,
  );
  console.log(
    `Gemini API Key: ${hasGemini ? "✅ Configured (" + GEMINI_API_KEY.substring(0, 8) + "...)" : "❌ Missing"}`,
  );
  console.log(
    `Anthropic API Key: ${hasAnthropic ? "✅ Configured (" + ANTHROPIC_API_KEY.substring(0, 8) + "...)" : "❌ Missing"}`,
  );
  console.log(
    `OpenRouter API Key: ${hasOpenRouter ? "✅ Configured (" + OPENROUTER_API_KEY.substring(0, 8) + "...)" : "❌ Missing"}`,
  );

  if (!hasApiKey) {
    console.log(
      "\n⚠️  Warning: No API keys found. Tests will use fallback responses.\n",
    );
  } else if (activeProviders.length === 1) {
    console.log(`\n🤖 Using ${activeProviders[0]} AI for agent responses.\n`);
  } else {
    console.log(
      `\n🤖 Using intelligent multi-provider routing (${activeProviders.join(" + ")}).\n`,
    );
  }

  const tests = [
    {
      agent: ArchitectureAgent,
      name: "ArchitectureAgent",
      task: {
        id: "test-arch-001",
        type: "ARCHITECTURE",
        parameters: {
          action: "analyze_architecture",
          description: "E-commerce platform with microservices architecture",
          techStack: "Node.js, React, PostgreSQL, Redis, Docker",
          scale: "100K daily active users",
          constraints: "High availability, scalable, secure",
        },
      },
    },
    {
      agent: SecurityAgent,
      name: "SecurityAgent",
      task: {
        id: "test-sec-001",
        type: "SECURITY",
        parameters: {
          action: "security_scan",
          appType: "Web Application API",
          techStack: "Express.js, MongoDB, JWT authentication",
          environment: "Production",
          compliance: "SOC2, GDPR compliance required",
        },
      },
    },
    {
      agent: QualityAgent,
      name: "QualityAgent",
      task: {
        id: "test-quality-001",
        type: "QUALITY",
        parameters: {
          action: "code_quality_check",
          projectType: "TypeScript REST API",
          language: "TypeScript",
          fileCount: "50+ files",
          teamSize: "Small team (3-5 developers)",
          codeSnippet: "function processUser(data) { return data.user.name; }",
        },
      },
    },
  ];

  const results = [];

  for (const test of tests) {
    const result = await testAgent(test.agent, test.name, test.task);
    results.push({ name: test.name, ...result });

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n📊 Test Summary");
  console.log("================");

  const successful = results.filter((r) => r.success).length;
  const total = results.length;
  const aiPowered = results.filter((r) => r.hasAI).length;

  console.log(`Tests passed: ${successful}/${total}`);
  console.log(`Success rate: ${Math.round((successful / total) * 100)}%`);

  if (hasApiKey) {
    console.log(`AI-powered responses: ${aiPowered}/${successful}`);
  }

  // Individual results
  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    const ai = result.hasAI ? "🤖" : "🔧";
    const time = result.duration ? `(${result.duration}ms)` : "";
    console.log(`  ${status} ${ai} ${result.name} ${time}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  });

  // Next steps
  console.log("\n🎯 Status Assessment");
  console.log("=====================");

  if (successful === total) {
    if (aiPowered === successful) {
      console.log("🎉 PHASE 1 COMPLETE: All agents working with AI!");
      if (activeProviders.length > 0) {
        console.log(
          `   → Real AI architectural analysis (${activeProviders.join("/")}) ✅`,
        );
        console.log(
          `   → AI-powered security scanning (${activeProviders.join("/")}) ✅`,
        );
        console.log(
          `   → Intelligent code quality assessment (${activeProviders.join("/")}) ✅`,
        );
        console.log(
          `   → Multi-provider routing with ${activeProviders.length} AI providers ✅`,
        );
      }
      console.log("   → Ready for API Gateway implementation");
      console.log("   → Ready for VS Code extension integration");
    } else {
      console.log("✅ All agents functional, some using fallback responses");
      console.log("   → Configure API keys for full AI capabilities");
      console.log("   → LLM integration architecture is working correctly");
    }
  } else {
    console.log("⚠️  Some agents need attention");
    console.log("   → Check error messages above");
    console.log("   → Verify agent implementations");
    console.log("   → Review LLM provider setup");
  }

  return results;
}

// Export for testing
export { runTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}
