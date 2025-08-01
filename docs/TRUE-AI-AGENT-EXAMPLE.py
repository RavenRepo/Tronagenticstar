#!/usr/bin/env python3
"""
Example: True AI Agent Implementation
Demonstrates how CodeCraft would work as a real AI specialist vs. current mock service
"""

import openai
import yaml
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

# Agent Personality Definition
@dataclass
class AgentPersona:
    role: str
    expertise: List[str]
    personality: Dict[str, str]
    constraints: List[str]
    knowledge_domains: List[str]
    
    @classmethod
    def from_yaml(cls, yaml_path: str):
        with open(yaml_path, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data)

# Sample CodeCraft Persona
CODECRAFT_PERSONA = AgentPersona(
    role="Senior Software Engineer & Code Quality Specialist",
    expertise=["code_review", "refactoring", "best_practices", "clean_code"],
    personality={
        "tone": "professional_but_friendly",
        "verbosity": "detailed_with_examples", 
        "decision_style": "evidence_based"
    },
    constraints=[
        "Never suggest architectural changes (refer to DesignForge)",
        "Never handle security issues (refer to SecuriShield)",
        "Always provide working code examples",
        "Must explain the reasoning behind suggestions"
    ],
    knowledge_domains=[
        "refactoring_patterns",
        "code_quality_metrics", 
        "testing_strategies",
        "programming_best_practices"
    ]
)

class AgentPromptEngine:
    def __init__(self, persona: AgentPersona):
        self.persona = persona
        self.system_prompt = self._build_system_prompt()
    
    def _build_system_prompt(self) -> str:
        return f"""You are {self.persona.role}, a specialist in {', '.join(self.persona.expertise)}.

PERSONALITY:
- Tone: {self.persona.personality['tone']}
- Response Style: {self.persona.personality['verbosity']}
- Decision Making: {self.persona.personality['decision_style']}

STRICT CONSTRAINTS - YOU MUST FOLLOW THESE:
{chr(10).join(f"- {c}" for c in self.persona.constraints)}

YOUR KNOWLEDGE DOMAINS:
{chr(10).join(f"- {d}" for d in self.persona.knowledge_domains)}

BEHAVIOR RULES:
1. If asked about architecture/design, say "That's DesignForge's expertise - let me connect you with them"
2. If asked about security, say "That's SecuriShield's domain - they'll handle that better"
3. If asked about performance optimization, say "PerfPulse specializes in that area"
4. Always provide specific, actionable code improvements
5. Explain WHY each suggestion improves code quality
6. Give working code examples whenever possible

You are a code quality specialist. Stay in your lane and excel at what you do best."""

    def format_request(self, user_request: str, code_context: Optional[str] = None) -> str:
        prompt = f"User Request: {user_request}\n\n"
        
        if code_context:
            prompt += f"Code to analyze:\n```\n{code_context}\n```\n\n"
        
        prompt += "Please provide your specialized code quality analysis and recommendations:"
        return prompt

class TrueAIAgent:
    def __init__(self, persona: AgentPersona, model: str = "gpt-4"):
        self.persona = persona
        self.prompt_engine = AgentPromptEngine(persona)
        self.client = openai.AsyncOpenAI()
        self.model = model
        
    async def process_request(self, user_request: str, code_context: Optional[str] = None) -> Dict:
        """Process request with true AI intelligence, not hardcoded responses"""
        
        # Check if request is within agent's domain
        if not self._is_request_valid(user_request):
            return self._create_referral_response(user_request)
        
        # Build context-aware prompt
        user_prompt = self.prompt_engine.format_request(user_request, code_context)
        
        messages = [
            {"role": "system", "content": self.prompt_engine.system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            # Get AI-generated response
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,  # Lower for consistent specialist behavior
                max_tokens=2000
            )
            
            ai_response = response.choices[0].message.content
            
            # Validate response stays within role
            if self._validate_response(ai_response):
                return {
                    "success": True,
                    "response": ai_response,
                    "agent": self.persona.role,
                    "confidence": 0.9,
                    "type": "specialized_analysis"
                }
            else:
                return self._create_validation_error()
                
        except Exception as e:
            return {
                "success": False,
                "error": f"AI processing failed: {str(e)}",
                "fallback": self._create_fallback_response(user_request)
            }
    
    def _is_request_valid(self, request: str) -> bool:
        """Check if request is within agent's expertise domain"""
        request_lower = request.lower()
        
        # Architecture requests - refer to DesignForge
        if any(keyword in request_lower for keyword in ['architecture', 'design pattern', 'system design']):
            return False
            
        # Security requests - refer to SecuriShield  
        if any(keyword in request_lower for keyword in ['security', 'vulnerability', 'exploit']):
            return False
            
        # Performance requests - refer to PerfPulse
        if any(keyword in request_lower for keyword in ['performance', 'optimize', 'speed up']):
            return False
            
        # Code quality requests - this is our domain
        if any(keyword in request_lower for keyword in ['refactor', 'code review', 'clean up', 'improve code']):
            return True
            
        return True  # Default to accepting if unclear
    
    def _validate_response(self, response: str) -> bool:
        """Ensure AI response stays within role boundaries"""
        response_lower = response.lower()
        
        # Check for constraint violations
        if "architecture" in response_lower and "designforge" not in response_lower:
            return False
            
        if "security" in response_lower and "securishield" not in response_lower:
            return False
            
        return True
    
    def _create_referral_response(self, request: str) -> Dict:
        """Create response referring user to appropriate specialist"""
        request_lower = request.lower()
        
        if any(keyword in request_lower for keyword in ['architecture', 'design']):
            specialist = "DesignForge"
            reason = "architectural design and system planning"
        elif any(keyword in request_lower for keyword in ['security', 'vulnerability']):
            specialist = "SecuriShield" 
            reason = "security analysis and vulnerability assessment"
        elif any(keyword in request_lower for keyword in ['performance', 'optimize']):
            specialist = "PerfPulse"
            reason = "performance optimization and profiling"
        else:
            specialist = "the appropriate specialist"
            reason = "that specific domain"
            
        return {
            "success": True,
            "response": f"I'm CodeCraft, focused on code quality and refactoring. Your request about {reason} would be better handled by {specialist}. Let me connect you with them for specialized expertise.",
            "agent": self.persona.role,
            "referral": specialist,
            "type": "referral"
        }
    
    def _create_validation_error(self) -> Dict:
        return {
            "success": False,
            "error": "Response validation failed - agent may have exceeded role boundaries",
            "fallback": "I apologize, but I need to stay within my code quality expertise. Please rephrase your request or let me connect you with the appropriate specialist."
        }
    
    def _create_fallback_response(self, request: str) -> str:
        """Fallback response when AI is unavailable"""
        return f"I'm CodeCraft, your code quality specialist. I'd love to help with '{request}', but I'm experiencing technical difficulties. Please try again in a moment, or contact DesignForge for architectural questions, SecuriShield for security concerns, or PerfPulse for performance optimization."

# Example Usage
async def demonstrate_true_ai_agent():
    """Show the difference between current mock and true AI agent"""
    
    agent = TrueAIAgent(CODECRAFT_PERSONA)
    
    # Test cases
    test_requests = [
        # Within domain - should handle
        ("Please review this code and suggest improvements", "def calculate_total(items):\n    total = 0\n    for item in items:\n        total += item\n    return total"),
        
        # Outside domain - should refer
        ("How should I architect a microservices system?", None),
        ("Check this code for security vulnerabilities", "user_input = input('Enter SQL: ')\ndb.execute(user_input)"),
        ("Optimize this algorithm for better performance", "def fibonacci(n):\n    if n <= 1: return n\n    return fibonacci(n-1) + fibonacci(n-2)")
    ]
    
    print("=== TRUE AI AGENT BEHAVIOR DEMONSTRATION ===\n")
    
    for request, code in test_requests:
        print(f"Request: {request}")
        if code:
            print(f"Code: {code}")
        
        response = await agent.process_request(request, code)
        
        print(f"Response Type: {response.get('type', 'unknown')}")
        print(f"Agent: {response.get('agent', 'Unknown')}")
        
        if response.get('referral'):
            print(f"Referred to: {response['referral']}")
        
        print(f"Response: {response.get('response', response.get('error', 'No response'))}")
        print("-" * 80)

if __name__ == "__main__":
    import asyncio
    asyncio.run(demonstrate_true_ai_agent())
