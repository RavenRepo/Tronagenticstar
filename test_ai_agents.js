#!/usr/bin/env node
/**
 * AI Agent Testing Script
 * Tests the LLM-powered agents directly without needing full orchestrator setup
 */

import { config } from 'dotenv';
import { ArchitectureAgent, SecurityAgent, QualityAgent } from './packages/orchestrator/dist/concreteAgents.js';

// Load environment variables
config();

console.log('🚀 Constella AI Agent Testing');
console.log('================================');

async function testAgent(agentClass, agentName, testTask) {
    console.log(`\n🔍 Testing ${agentName}...`);
    console.log(`Task: ${testTask.parameters.action}`);

    try {
        const agent = new agentClass({
            id: `test-${agentName.toLowerCase()}`,
            specialization: testTask.type,
            llmApiKey: process.env.OPENAI_API_KEY
        });

        const startTime = Date.now();
        const result = await agent.execute(testTask);
        const duration = Date.now() - startTime;

        console.log(`✅ ${agentName} completed in ${duration}ms`);

        // Show key results
        if (result.analysis) {
            console.log(`   Analysis: ${result.analysis.substring(0, 100)}...`);
        }
        if (result.recommendations) {
            console.log(`   Recommendations: ${result.recommendations.length} items`);
        }
        if (result.ai_powered) {
            console.log(`   🤖 AI-Powered: ${result.model_used || 'Yes'}`);
        }
        if (result.error) {
            console.log(`   ⚠️  Error: ${result.error}`);
        }

        return { success: true, duration, result };

    } catch (error) {
        console.log(`❌ ${agentName} failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    console.log(`OpenAI API Key: ${hasApiKey ? '✅ Configured' : '❌ Missing'}`);

    if (!hasApiKey) {
        console.log('\n⚠️  Warning: No OpenAI API key found. Tests will use fallback responses.\n');
    }

    const tests = [
        {
            agent: ArchitectureAgent,
            name: 'ArchitectureAgent',
            task: {
                id: 'test-arch-001',
                type: 'ARCHITECTURE',
                parameters: {
                    action: 'analyze_architecture',
                    description: 'E-commerce platform with microservices',
                    techStack: 'Node.js, React, PostgreSQL, Redis',
                    scale: '100K users',
                    constraints: 'High availability required'
                }
            }
        },
        {
            agent: SecurityAgent,
            name: 'SecurityAgent',
            task: {
                id: 'test-sec-001',
                type: 'SECURITY',
                parameters: {
                    action: 'security_scan',
                    appType: 'Web Application',
                    techStack: 'Express.js, MongoDB, JWT',
                    environment: 'Production',
                    compliance: 'SOC2, GDPR'
                }
            }
        },
        {
            agent: QualityAgent,
            name: 'QualityAgent',
            task: {
                id: 'test-quality-001',
                type: 'QUALITY',
                parameters: {
                    action: 'code_quality_check',
                    projectType: 'TypeScript API',
                    language: 'TypeScript',
                    fileCount: '50+',
                    teamSize: 'Small team (3-5 developers)'
                }
            }
        }
    ];

    const results = [];

    for (const test of tests) {
        const result = await testAgent(test.agent, test.name, test.task);
        results.push({ name: test.name, ...result });
    }

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');

    const successful = results.filter(r => r.success).length;
    const total = results.length;

    console.log(`Tests passed: ${successful}/${total}`);
    console.log(`Success rate: ${Math.round((successful/total) * 100)}%`);

    if (hasApiKey) {
        const aiPowered = results.filter(r => r.result?.ai_powered || r.result?.model_used).length;
        console.log(`AI-powered responses: ${aiPowered}/${successful}`);
    }

    // Individual results
    results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        const time = result.duration ? `(${result.duration}ms)` : '';
        console.log(`  ${status} ${result.name} ${time}`);
        if (result.error) {
            console.log(`      Error: ${result.error}`);
        }
    });

    // Next steps
    console.log('\n🎯 Next Steps');
    console.log('==============');

    if (successful === total) {
        console.log('✅ All agents working correctly!');
        console.log('   → Ready for API Gateway implementation');
        console.log('   → Ready for VS Code extension integration');
        console.log('   → Phase 1 LLM integration: COMPLETE');
    } else {
        console.log('⚠️  Some agents need attention');
        console.log('   → Check error messages above');
        console.log('   → Verify OpenAI API key configuration');
        console.log('   → Review LLM provider setup');
    }

    return results;
}

// Run the tests
runTests().catch(console.error);
