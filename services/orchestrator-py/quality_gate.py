"""Quality Gate verification stub.
In production, this would query CI metadata or an attestation service.
MVP: pass-through with logging.
"""
import logging

logger = logging.getLogger("quality_gate")


async def verify(image_sha: str) -> bool:
    """Return True if the agent image passes quality criteria."""
    # TODO: integrate with external attestation when available.
    logger.debug("QualityGate check for %s -> PASS (stub)", image_sha)
    return True 