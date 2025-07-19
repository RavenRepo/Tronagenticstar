"""
SOC-2 Compliance Service - Compliance Alpha Phase
Part of the AgentForge/Constella compliance and governance ecosystem
"""

from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from enum import Enum
import time
import json
import logging
from datetime import datetime, timedelta
import asyncio

app = FastAPI(
    title="SOC-2 Compliance Service",
    description="SOC-2 compliance monitoring, rule evaluation, and evidence collection",
    version="1.0.0"
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# SOC-2 Trust Service Categories
class TrustServiceCategory(str, Enum):
    SECURITY = "security"
    AVAILABILITY = "availability" 
    PROCESSING_INTEGRITY = "processing_integrity"
    CONFIDENTIALITY = "confidentiality"
    PRIVACY = "privacy"

class ComplianceStatus(str, Enum):
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"
    WARNING = "warning"
    UNKNOWN = "unknown"

class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# Request/Response Models
class ComplianceRule(BaseModel):
    rule_id: str
    category: TrustServiceCategory
    title: str
    description: str
    severity: SeverityLevel
    automated_check: bool = True
    evidence_requirements: List[str] = []

class ComplianceCheck(BaseModel):
    service_name: str
    rules: Optional[List[str]] = None  # If None, check all rules
    include_evidence: bool = True

class ComplianceViolation(BaseModel):
    rule_id: str
    severity: SeverityLevel
    message: str
    evidence: Dict[str, Any] = {}
    timestamp: datetime
    remediation_steps: List[str] = []

class ComplianceReport(BaseModel):
    service_name: str
    timestamp: datetime
    overall_status: ComplianceStatus
    violations: List[ComplianceViolation] = []
    compliant_rules: List[str] = []
    score: float  # 0-100 compliance score
    evidence_collected: Dict[str, Any] = {}

class EvidenceExportRequest(BaseModel):
    start_date: datetime
    end_date: datetime
    categories: Optional[List[TrustServiceCategory]] = None
    format: str = "json"  # json, csv, pdf

class EvidenceExportResponse(BaseModel):
    export_id: str
    download_url: str
    format: str
    size_mb: float
    records_count: int

# Global compliance rules registry
COMPLIANCE_RULES = {
    "CC6.1": ComplianceRule(
        rule_id="CC6.1",
        category=TrustServiceCategory.SECURITY,
        title="Logical and Physical Access Controls",
        description="Entity implements logical and physical access controls to prevent unauthorized access",
        severity=SeverityLevel.HIGH,
        evidence_requirements=["access_logs", "authentication_records", "authorization_policies"]
    ),
    "CC6.2": ComplianceRule(
        rule_id="CC6.2", 
        category=TrustServiceCategory.SECURITY,
        title="User Access Management",
        description="Prior to issuing system credentials, entity registers users and authorizes access",
        severity=SeverityLevel.HIGH,
        evidence_requirements=["user_registration_logs", "access_approval_records"]
    ),
    "CC6.3": ComplianceRule(
        rule_id="CC6.3",
        category=TrustServiceCategory.SECURITY,
        title="Network Security",
        description="Entity authorizes, modifies, or removes access to data, software, and infrastructure",
        severity=SeverityLevel.MEDIUM,
        evidence_requirements=["network_configurations", "firewall_rules", "security_groups"]
    ),
    "CC7.1": ComplianceRule(
        rule_id="CC7.1",
        category=TrustServiceCategory.SECURITY,
        title="System Operations",
        description="Entity restricts the transmission, movement, and removal of information",
        severity=SeverityLevel.MEDIUM,
        evidence_requirements=["data_transfer_logs", "encryption_records"]
    ),
    "A1.1": ComplianceRule(
        rule_id="A1.1",
        category=TrustServiceCategory.AVAILABILITY,
        title="System Availability",
        description="Entity maintains system availability commitments and requirements",
        severity=SeverityLevel.HIGH,
        evidence_requirements=["uptime_metrics", "incident_reports", "sla_compliance"]
    )
}

# Global evidence storage (in production, use proper database)
evidence_store = {}
compliance_history = []

@app.post("/evaluate", response_model=ComplianceReport)
async def evaluate_compliance(request: ComplianceCheck):
    """
    Evaluate SOC-2 compliance for a service against specified rules
    """
    try:
        timestamp = datetime.now()
        violations = []
        compliant_rules = []
        evidence_collected = {}
        
        # Determine which rules to check
        rules_to_check = request.rules if request.rules else list(COMPLIANCE_RULES.keys())
        
        for rule_id in rules_to_check:
            if rule_id not in COMPLIANCE_RULES:
                continue
                
            rule = COMPLIANCE_RULES[rule_id]
            
            # Simulate compliance checking (in production, implement actual checks)
            is_compliant, evidence, violation_message = await _check_rule_compliance(
                request.service_name, rule
            )
            
            if request.include_evidence and evidence:
                evidence_collected[rule_id] = evidence
                
            if is_compliant:
                compliant_rules.append(rule_id)
            else:
                violation = ComplianceViolation(
                    rule_id=rule_id,
                    severity=rule.severity,
                    message=violation_message,
                    evidence=evidence,
                    timestamp=timestamp,
                    remediation_steps=_get_remediation_steps(rule_id)
                )
                violations.append(violation)
        
        # Calculate compliance score
        total_rules = len(rules_to_check)
        compliant_count = len(compliant_rules)
        score = (compliant_count / total_rules) * 100 if total_rules > 0 else 0
        
        # Determine overall status
        if score >= 95:
            overall_status = ComplianceStatus.COMPLIANT
        elif score >= 80:
            overall_status = ComplianceStatus.WARNING
        else:
            overall_status = ComplianceStatus.NON_COMPLIANT
            
        report = ComplianceReport(
            service_name=request.service_name,
            timestamp=timestamp,
            overall_status=overall_status,
            violations=violations,
            compliant_rules=compliant_rules,
            score=score,
            evidence_collected=evidence_collected
        )
        
        # Store report in history
        compliance_history.append(report.dict())
        
        return report
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compliance evaluation failed: {str(e)}")

@app.post("/evidence/export", response_model=EvidenceExportResponse) 
async def export_evidence(request: EvidenceExportRequest):
    """
    Export compliance evidence for specified date range and categories
    """
    try:
        # Filter evidence by date range and categories
        filtered_evidence = []
        for record in compliance_history:
            record_date = datetime.fromisoformat(record['timestamp'].replace('Z', '+00:00'))
            if request.start_date <= record_date <= request.end_date:
                if not request.categories or any(
                    cat.value in str(record) for cat in request.categories
                ):
                    filtered_evidence.append(record)
        
        # Generate export
        export_id = f"export_{int(time.time())}"
        export_data = {
            "export_metadata": {
                "export_id": export_id,
                "generated_at": datetime.now().isoformat(),
                "date_range": {
                    "start": request.start_date.isoformat(),
                    "end": request.end_date.isoformat()
                },
                "categories": [cat.value for cat in request.categories] if request.categories else "all"
            },
            "compliance_evidence": filtered_evidence
        }
        
        # Store export (in production, generate actual file)
        evidence_store[export_id] = export_data
        
        # Calculate size (rough estimate)
        size_mb = len(json.dumps(export_data)) / (1024 * 1024)
        
        return EvidenceExportResponse(
            export_id=export_id,
            download_url=f"/evidence/download/{export_id}",
            format=request.format,
            size_mb=round(size_mb, 2),
            records_count=len(filtered_evidence)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evidence export failed: {str(e)}")

@app.get("/evidence/download/{export_id}")
async def download_evidence(export_id: str):
    """
    Download exported evidence package
    """
    if export_id not in evidence_store:
        raise HTTPException(status_code=404, detail="Export not found")
    
    return evidence_store[export_id]

@app.get("/rules")
async def get_compliance_rules():
    """
    Get all available SOC-2 compliance rules
    """
    return {
        "rules": [rule.dict() for rule in COMPLIANCE_RULES.values()],
        "categories": [cat.value for cat in TrustServiceCategory],
        "total_rules": len(COMPLIANCE_RULES)
    }

@app.get("/history/{service_name}")
async def get_compliance_history(service_name: str, limit: int = 10):
    """
    Get compliance history for a specific service
    """
    service_history = [
        record for record in compliance_history[-limit:]
        if record.get('service_name') == service_name
    ]
    return {
        "service_name": service_name,
        "records": service_history,
        "total_records": len(service_history)
    }

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "service": "soc2-compliance",
        "version": "1.0.0",
        "timestamp": time.time(),
        "rules_loaded": len(COMPLIANCE_RULES),
        "evidence_records": len(compliance_history)
    }

@app.get("/metrics")
async def get_metrics():
    """
    Prometheus-compatible metrics endpoint
    """
    try:
        # Calculate compliance metrics
        recent_reports = compliance_history[-50:] if compliance_history else []
        total_evaluations = len(compliance_history)
        
        compliance_rates = {}
        for category in TrustServiceCategory:
            category_reports = [r for r in recent_reports if category.value in str(r)]
            if category_reports:
                avg_score = sum(r.get('score', 0) for r in category_reports) / len(category_reports)
                compliance_rates[f"soc2_compliance_rate_{category.value}"] = avg_score
        
        return {
            "soc2_total_evaluations": total_evaluations,
            "soc2_rules_available": len(COMPLIANCE_RULES),
            "soc2_evidence_exports": len(evidence_store),
            "soc2_uptime_seconds": time.time(),
            **compliance_rates
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metrics collection failed: {str(e)}")

@app.get("/")
async def root():
    """
    Root endpoint with service information
    """
    return {
        "service": "SOC-2 Compliance Service",
        "description": "SOC-2 compliance monitoring, rule evaluation, and evidence collection",
        "version": "1.0.0",
        "compliance_alpha_phase": True,
        "endpoints": {
            "evaluate": "POST /evaluate - Evaluate service compliance",
            "export": "POST /evidence/export - Export compliance evidence",
            "rules": "GET /rules - Get all compliance rules",
            "history": "GET /history/{service} - Get compliance history",
            "health": "GET /health - Health check",
            "metrics": "GET /metrics - Prometheus metrics"
        }
    }

# Helper functions
async def _check_rule_compliance(service_name: str, rule: ComplianceRule) -> tuple[bool, dict, str]:
    """
    Check compliance for a specific rule (simulated implementation)
    """
    # Simulate different compliance scenarios based on rule and service
    await asyncio.sleep(0.1)  # Simulate processing time
    
    if rule.rule_id == "CC6.1":
        # Access control check
        evidence = {
            "access_logs_present": True,
            "failed_login_attempts": 2,
            "mfa_enabled": True
        }
        is_compliant = evidence["failed_login_attempts"] < 5 and evidence["mfa_enabled"]
        message = "Access controls properly configured" if is_compliant else "High failed login attempts detected"
        
    elif rule.rule_id == "A1.1":
        # Availability check
        evidence = {
            "uptime_percentage": 99.8,
            "incident_count": 1,
            "mean_recovery_time": 15
        }
        is_compliant = evidence["uptime_percentage"] >= 99.5
        message = f"Uptime: {evidence['uptime_percentage']}%" if is_compliant else "SLA breach detected"
        
    else:
        # Default check
        evidence = {"check_performed": True, "timestamp": datetime.now().isoformat()}
        is_compliant = True  # Assume compliant for demo
        message = "Rule compliance verified"
    
    return is_compliant, evidence, message

def _get_remediation_steps(rule_id: str) -> List[str]:
    """
    Get remediation steps for a specific rule violation
    """
    remediation_map = {
        "CC6.1": [
            "Review and update access control policies",
            "Implement multi-factor authentication",
            "Monitor failed login attempts",
            "Conduct access review quarterly"
        ],
        "CC6.2": [
            "Implement user registration workflow",
            "Require manager approval for access",
            "Document access justification",
            "Regular access recertification"
        ],
        "A1.1": [
            "Investigate availability incidents",
            "Implement redundancy measures",
            "Update incident response procedures",
            "Monitor SLA compliance metrics"
        ]
    }
    
    return remediation_map.get(rule_id, ["Review compliance requirement", "Implement appropriate controls"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8020)
