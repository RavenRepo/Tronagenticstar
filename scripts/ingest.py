#!/usr/bin/env python3
"""
Constella RAG Ingestion Pipeline
=================================
Complete pipeline for ingesting documents into the Constella knowledge base.

Supports:
  - Single files (code, markdown, text, JSON, YAML, TOML)
  - Directory recursive scanning with gitignore-aware filtering
  - Stdin piping for ad-hoc text ingestion
  - Batch ingestion with progress tracking
  - Chunking strategies: fixed-size, semantic (by headings/functions), sliding window
  - Embedding via the Embedding service (remote) or local sentence-transformers
  - Dual-write to Qdrant (vector search) and Neo4j (knowledge graph relationships)
  - Deduplication via content hashing (idempotent re-runs)
  - Metadata extraction (language detection, imports, exports, classes, functions)

Usage:
  # Ingest a single file
  python scripts/ingest.py file path/to/file.py

  # Ingest a directory recursively
  python scripts/ingest.py dir ./services --project myproject

  # Ingest from stdin
  echo "Some knowledge to remember" | python scripts/ingest.py stdin --tags "note,architecture"

  # Ingest with custom chunking
  python scripts/ingest.py file path/to/large_doc.md --chunk-strategy semantic --chunk-size 1024

  # Dry run (show what would be ingested without writing)
  python scripts/ingest.py dir ./src --dry-run

  # Re-index everything (clear + re-ingest)
  python scripts/ingest.py dir ./services --clear-collection

Environment variables:
  QDRANT_URL            default http://localhost:6333
  NEO4J_URL             default bolt://localhost:7687
  NEO4J_USER            default neo4j
  NEO4J_PASSWORD        default (empty)
  EMBEDDING_SERVICE_URL default http://localhost:8004
  EMBEDDING_MODEL       default all-MiniLM-L6-v2
  COLLECTION_NAME       default constella_memories
  REDIS_URL             default redis://localhost:6379/0
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import logging
import mimetypes
import os
import re
import sys
import textwrap
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Config & Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rag-ingest")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
NEO4J_URL = os.getenv("NEO4J_URL", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
EMBEDDING_SERVICE_URL = os.getenv("EMBEDDING_SERVICE_URL", "http://localhost:8004")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "constella_memories")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
VECTOR_DIM = int(os.getenv("EMBEDDING_DIM", "384"))

# Maximum file size to ingest (10 MB)
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_BYTES", str(10 * 1024 * 1024)))

# Default patterns to skip during directory ingestion
DEFAULT_IGNORE_PATTERNS = [
    "node_modules",
    "__pycache__",
    ".git",
    ".venv",
    "venv",
    "env",
    ".env",
    ".DS_Store",
    "*.pyc",
    "*.pyo",
    "*.so",
    "*.dylib",
    "*.dll",
    "*.exe",
    "*.bin",
    "*.o",
    "*.a",
    "*.class",
    "*.jar",
    "*.war",
    "*.ear",
    "*.egg-info",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".docusaurus",
    "coverage",
    ".nyc_output",
    ".pytest_cache",
    ".tox",
    "*.min.js",
    "*.min.css",
    "*.map",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot",
    "*.ico",
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.svg",
    "*.bmp",
    "*.webp",
    "*.mp3",
    "*.mp4",
    "*.avi",
    "*.mov",
    "*.pdf",
    "*.zip",
    "*.tar",
    "*.gz",
    "*.bz2",
    "*.7z",
    "*.rar",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "Gemfile.lock",
    "poetry.lock",
    "Cargo.lock",
]

# File extensions we know how to process
SUPPORTED_EXTENSIONS = {
    # Code
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".swift",
    ".kt",
    ".kts",
    ".scala",
    ".clj",
    ".erl",
    ".ex",
    ".exs",
    ".lua",
    ".r",
    ".R",
    ".jl",
    ".zig",
    ".nim",
    ".v",
    ".dart",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".sql",
    ".graphql",
    ".gql",
    ".proto",
    # Config / Data
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".xml",
    ".csv",
    ".env.example",
    # Documentation
    ".md",
    ".mdx",
    ".rst",
    ".txt",
    ".adoc",
    ".org",
    # Web
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".sass",
    ".less",
    # DevOps
    ".dockerfile",
    ".tf",
    ".hcl",
    ".nginx",
    ".Makefile",
    # Special filenames handled separately
}

SUPPORTED_FILENAMES = {
    "Dockerfile",
    "Makefile",
    "Vagrantfile",
    "Procfile",
    "Gemfile",
    "Rakefile",
    "Guardfile",
    "Brewfile",
    ".gitignore",
    ".dockerignore",
    ".editorconfig",
    ".eslintrc",
    ".prettierrc",
    ".babelrc",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "pyproject.toml",
    "package.json",
    "tsconfig.json",
    "docker-compose.yml",
    "docker-compose.yaml",
    "docker-compose.prod.yml",
    "docker-compose.dev.yml",
}


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class DocumentChunk:
    """A single chunk of a document ready for embedding and indexing."""

    chunk_id: str
    source_path: str
    content: str
    chunk_index: int
    total_chunks: int
    content_hash: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def search_text(self) -> str:
        """Text used for embedding generation."""
        header = f"File: {self.source_path}"
        if self.metadata.get("language"):
            header += f" | Language: {self.metadata['language']}"
        if self.total_chunks > 1:
            header += f" | Chunk {self.chunk_index + 1}/{self.total_chunks}"
        return f"{header}\n\n{self.content}"


@dataclass
class IngestResult:
    """Result of ingesting a single source."""

    source_path: str
    chunks_created: int
    chunks_indexed: int
    chunks_skipped_duplicate: int
    duration_ms: float
    error: Optional[str] = None


@dataclass
class IngestSummary:
    """Summary of an entire ingestion run."""

    total_sources: int = 0
    total_chunks_created: int = 0
    total_chunks_indexed: int = 0
    total_chunks_skipped: int = 0
    total_errors: int = 0
    total_duration_ms: float = 0.0
    results: List[IngestResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Language Detection
# ---------------------------------------------------------------------------

EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".clj": "clojure",
    ".erl": "erlang",
    ".ex": "elixir",
    ".exs": "elixir",
    ".lua": "lua",
    ".r": "r",
    ".R": "r",
    ".jl": "julia",
    ".zig": "zig",
    ".nim": "nim",
    ".dart": "dart",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".fish": "shell",
    ".ps1": "powershell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".proto": "protobuf",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".xml": "xml",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".md": "markdown",
    ".mdx": "markdown",
    ".rst": "rst",
    ".txt": "text",
    ".dockerfile": "dockerfile",
    ".tf": "terraform",
    ".hcl": "hcl",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "config",
}


def detect_language(filepath: str) -> str:
    """Detect programming language from file extension or name."""
    name = os.path.basename(filepath).lower()
    if name == "dockerfile":
        return "dockerfile"
    if name == "makefile":
        return "makefile"
    if name in ("vagrantfile", "gemfile", "rakefile", "guardfile"):
        return "ruby"
    if name in (".gitignore", ".dockerignore"):
        return "gitignore"
    if name == "requirements.txt":
        return "requirements"
    ext = os.path.splitext(filepath)[1].lower()
    return EXTENSION_TO_LANGUAGE.get(ext, "unknown")


# ---------------------------------------------------------------------------
# Metadata Extraction
# ---------------------------------------------------------------------------


def extract_code_metadata(content: str, language: str) -> Dict[str, Any]:
    """Extract structural metadata from source code."""
    metadata: Dict[str, Any] = {
        "line_count": content.count("\n") + 1,
        "char_count": len(content),
        "language": language,
    }

    if language == "python":
        metadata["imports"] = re.findall(
            r"^(?:from\s+(\S+)\s+import|import\s+(\S+))", content, re.MULTILINE
        )
        metadata["imports"] = [m[0] or m[1] for m in metadata["imports"]][
            :20
        ]  # cap at 20
        metadata["classes"] = re.findall(r"^class\s+(\w+)", content, re.MULTILINE)[:20]
        metadata["functions"] = re.findall(
            r"^(?:async\s+)?def\s+(\w+)", content, re.MULTILINE
        )[:30]
        metadata["has_main"] = "if __name__" in content

    elif language in ("javascript", "typescript"):
        metadata["imports"] = re.findall(
            r"""(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))""",
            content,
        )
        metadata["imports"] = [m[0] or m[1] for m in metadata["imports"]][:20]
        metadata["exports"] = re.findall(
            r"export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)",
            content,
        )[:20]
        metadata["classes"] = re.findall(r"class\s+(\w+)", content)[:20]
        metadata["functions"] = re.findall(
            r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>)",
            content,
        )
        metadata["functions"] = [m[0] or m[1] for m in metadata["functions"]][:30]

    elif language == "go":
        metadata["package"] = ""
        pkg_match = re.search(r"^package\s+(\w+)", content, re.MULTILINE)
        if pkg_match:
            metadata["package"] = pkg_match.group(1)
        metadata["functions"] = re.findall(
            r"^func\s+(?:\([^)]+\)\s+)?(\w+)", content, re.MULTILINE
        )[:30]
        metadata["structs"] = re.findall(
            r"^type\s+(\w+)\s+struct", content, re.MULTILINE
        )[:20]
        metadata["interfaces"] = re.findall(
            r"^type\s+(\w+)\s+interface", content, re.MULTILINE
        )[:20]

    elif language == "java":
        metadata["classes"] = re.findall(
            r"(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)",
            content,
        )[:20]
        metadata["interfaces"] = re.findall(
            r"(?:public\s+)?interface\s+(\w+)", content
        )[:20]
        metadata["functions"] = re.findall(
            r"(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)(\w+)\s*\(",
            content,
        )[:30]

    elif language == "rust":
        metadata["functions"] = re.findall(
            r"(?:pub\s+)?(?:async\s+)?fn\s+(\w+)", content
        )[:30]
        metadata["structs"] = re.findall(r"(?:pub\s+)?struct\s+(\w+)", content)[:20]
        metadata["enums"] = re.findall(r"(?:pub\s+)?enum\s+(\w+)", content)[:20]
        metadata["traits"] = re.findall(r"(?:pub\s+)?trait\s+(\w+)", content)[:20]

    elif language == "markdown":
        metadata["headings"] = re.findall(r"^(#{1,6})\s+(.+)$", content, re.MULTILINE)
        metadata["headings"] = [
            {"level": len(h[0]), "text": h[1].strip()} for h in metadata["headings"]
        ][:30]
        metadata["has_code_blocks"] = "```" in content
        metadata["links"] = len(re.findall(r"\[([^\]]+)\]\([^)]+\)", content))

    elif language in ("yaml", "json", "toml"):
        metadata["is_config"] = True

    elif language == "dockerfile":
        metadata["base_images"] = re.findall(r"^FROM\s+(\S+)", content, re.MULTILINE)[
            :10
        ]
        metadata["exposed_ports"] = re.findall(
            r"^EXPOSE\s+(\d+)", content, re.MULTILINE
        )

    elif language == "sql":
        metadata["tables_created"] = re.findall(
            r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)",
            content,
            re.IGNORECASE,
        )[:20]
        metadata["tables_altered"] = re.findall(
            r"ALTER\s+TABLE\s+(\S+)", content, re.IGNORECASE
        )[:20]

    return metadata


# ---------------------------------------------------------------------------
# Chunking Strategies
# ---------------------------------------------------------------------------


def _content_hash(text: str) -> str:
    """Compute a stable content hash for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _stable_uuid(text: str) -> str:
    """Deterministic UUID from a string so re-runs are idempotent."""
    return str(uuid.UUID(hashlib.md5(text.encode("utf-8")).hexdigest()))


def chunk_fixed_size(
    content: str,
    source_path: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
    metadata: Optional[Dict[str, Any]] = None,
) -> List[DocumentChunk]:
    """Split content into fixed-size character chunks with overlap."""
    if not content.strip():
        return []

    metadata = metadata or {}
    chunks: List[DocumentChunk] = []
    text = content.strip()

    if len(text) <= chunk_size:
        c_hash = _content_hash(text)
        chunks.append(
            DocumentChunk(
                chunk_id=_stable_uuid(f"{source_path}:0:{c_hash}"),
                source_path=source_path,
                content=text,
                chunk_index=0,
                total_chunks=1,
                content_hash=c_hash,
                metadata=metadata,
            )
        )
        return chunks

    start = 0
    idx = 0
    while start < len(text):
        end = start + chunk_size
        chunk_text = text[start:end]

        # Try to break at a natural boundary (newline, sentence end)
        if end < len(text):
            # Look for last newline in the last 20% of the chunk
            search_start = max(0, len(chunk_text) - chunk_size // 5)
            last_nl = chunk_text.rfind("\n", search_start)
            if last_nl > 0:
                chunk_text = chunk_text[: last_nl + 1]
                end = start + last_nl + 1

        chunk_text = chunk_text.strip()
        if chunk_text:
            c_hash = _content_hash(chunk_text)
            chunks.append(
                DocumentChunk(
                    chunk_id=_stable_uuid(f"{source_path}:{idx}:{c_hash}"),
                    source_path=source_path,
                    content=chunk_text,
                    chunk_index=idx,
                    total_chunks=0,  # filled in below
                    content_hash=c_hash,
                    metadata=metadata,
                )
            )
            idx += 1

        start = end - chunk_overlap
        if start >= len(text):
            break
        # Safety: always advance at least 1 char to prevent infinite loops
        if end - chunk_overlap <= start and start < len(text):
            start = end

    for c in chunks:
        c.total_chunks = len(chunks)

    return chunks


def chunk_semantic(
    content: str,
    source_path: str,
    chunk_size: int = 1024,
    metadata: Optional[Dict[str, Any]] = None,
) -> List[DocumentChunk]:
    """
    Split content at semantic boundaries:
    - Markdown: by headings
    - Code: by top-level function/class definitions
    - Other: by double newlines (paragraphs)

    Falls back to fixed-size chunking if semantic chunks are too large.
    """
    metadata = metadata or {}
    language = metadata.get("language", detect_language(source_path))
    sections: List[str] = []

    if language == "markdown":
        # Split by headings (## or higher)
        parts = re.split(r"(?=^#{1,3}\s)", content, flags=re.MULTILINE)
        sections = [p.strip() for p in parts if p.strip()]

    elif language == "python":
        # Split by top-level class/function definitions
        parts = re.split(
            r"(?=^(?:class |(?:async )?def ))", content, flags=re.MULTILINE
        )
        sections = [p.strip() for p in parts if p.strip()]

    elif language in ("javascript", "typescript"):
        # Split by export/function/class declarations
        parts = re.split(
            r"(?=^(?:export |(?:async )?function |class ))",
            content,
            flags=re.MULTILINE,
        )
        sections = [p.strip() for p in parts if p.strip()]

    elif language == "go":
        parts = re.split(r"(?=^func )", content, flags=re.MULTILINE)
        sections = [p.strip() for p in parts if p.strip()]

    elif language == "rust":
        parts = re.split(
            r"(?=^(?:pub )?(?:async )?(?:fn |struct |enum |trait |impl ))",
            content,
            flags=re.MULTILINE,
        )
        sections = [p.strip() for p in parts if p.strip()]

    else:
        # Generic: split by double newlines (paragraphs)
        parts = re.split(r"\n\s*\n", content)
        sections = [p.strip() for p in parts if p.strip()]

    if not sections:
        sections = [content.strip()]

    # Now, merge small sections and split large ones
    merged: List[str] = []
    current_buf = ""

    for section in sections:
        if len(current_buf) + len(section) + 2 <= chunk_size:
            current_buf = (current_buf + "\n\n" + section).strip()
        else:
            if current_buf:
                merged.append(current_buf)
            if len(section) > chunk_size:
                # Section too large, use fixed-size sub-chunking
                sub_chunks = chunk_fixed_size(
                    section,
                    source_path,
                    chunk_size=chunk_size,
                    chunk_overlap=64,
                    metadata=metadata,
                )
                for sc in sub_chunks:
                    merged.append(sc.content)
            else:
                current_buf = section

    if current_buf:
        merged.append(current_buf)

    if not merged:
        merged = [content.strip()]

    # Build DocumentChunk objects
    chunks: List[DocumentChunk] = []
    for idx, text in enumerate(merged):
        text = text.strip()
        if not text:
            continue
        c_hash = _content_hash(text)
        chunks.append(
            DocumentChunk(
                chunk_id=_stable_uuid(f"{source_path}:{idx}:{c_hash}"),
                source_path=source_path,
                content=text,
                chunk_index=idx,
                total_chunks=len(merged),
                content_hash=c_hash,
                metadata=metadata,
            )
        )

    for c in chunks:
        c.total_chunks = len(chunks)

    return chunks


def chunk_sliding_window(
    content: str,
    source_path: str,
    window_size: int = 512,
    step_size: int = 256,
    metadata: Optional[Dict[str, Any]] = None,
) -> List[DocumentChunk]:
    """
    Sliding window chunking: overlapping windows for maximum recall.
    Good for dense technical content where context bleeds across boundaries.
    """
    metadata = metadata or {}
    text = content.strip()
    if not text:
        return []

    if len(text) <= window_size:
        c_hash = _content_hash(text)
        return [
            DocumentChunk(
                chunk_id=_stable_uuid(f"{source_path}:0:{c_hash}"),
                source_path=source_path,
                content=text,
                chunk_index=0,
                total_chunks=1,
                content_hash=c_hash,
                metadata=metadata,
            )
        ]

    chunks: List[DocumentChunk] = []
    idx = 0
    start = 0

    while start < len(text):
        end = min(start + window_size, len(text))
        window_text = text[start:end].strip()
        if window_text:
            c_hash = _content_hash(window_text)
            chunks.append(
                DocumentChunk(
                    chunk_id=_stable_uuid(f"{source_path}:sw:{idx}:{c_hash}"),
                    source_path=source_path,
                    content=window_text,
                    chunk_index=idx,
                    total_chunks=0,
                    content_hash=c_hash,
                    metadata=metadata,
                )
            )
            idx += 1

        start += step_size
        if start + step_size >= len(text) and end >= len(text):
            break

    for c in chunks:
        c.total_chunks = len(chunks)

    return chunks


CHUNKING_STRATEGIES = {
    "fixed": chunk_fixed_size,
    "semantic": chunk_semantic,
    "sliding": chunk_sliding_window,
}


# ---------------------------------------------------------------------------
# File Discovery
# ---------------------------------------------------------------------------


def _should_ignore(path: str, ignore_patterns: List[str]) -> bool:
    """Check if a path matches any ignore pattern."""
    name = os.path.basename(path)
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(name, pattern):
            return True
        if fnmatch.fnmatch(path, pattern):
            return True
        # Also match if any path component matches the pattern
        parts = Path(path).parts
        for part in parts:
            if fnmatch.fnmatch(part, pattern):
                return True
    return False


def _is_supported_file(filepath: str) -> bool:
    """Check if a file is a supported type for ingestion."""
    name = os.path.basename(filepath)
    if name in SUPPORTED_FILENAMES:
        return True
    ext = os.path.splitext(filepath)[1].lower()
    return ext in SUPPORTED_EXTENSIONS


def _load_gitignore(directory: str) -> List[str]:
    """Load .gitignore patterns from a directory."""
    gitignore_path = os.path.join(directory, ".gitignore")
    patterns: List[str] = []
    if os.path.isfile(gitignore_path):
        try:
            with open(gitignore_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        patterns.append(line)
        except Exception:
            pass
    return patterns


def discover_files(
    directory: str,
    ignore_patterns: Optional[List[str]] = None,
    respect_gitignore: bool = True,
) -> Generator[str, None, None]:
    """
    Recursively discover files in a directory that are suitable for ingestion.
    Respects .gitignore patterns and default ignore rules.
    """
    patterns = list(DEFAULT_IGNORE_PATTERNS)
    if ignore_patterns:
        patterns.extend(ignore_patterns)
    if respect_gitignore:
        patterns.extend(_load_gitignore(directory))

    for root, dirs, files in os.walk(directory):
        # Filter directories in-place to avoid traversing ignored dirs
        dirs[:] = [
            d for d in dirs if not _should_ignore(d, patterns) and not d.startswith(".")
        ]

        for filename in sorted(files):
            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, directory)

            if _should_ignore(rel_path, patterns):
                continue
            if not _is_supported_file(filepath):
                continue

            try:
                size = os.path.getsize(filepath)
                if size > MAX_FILE_SIZE_BYTES:
                    log.debug(f"Skipping {rel_path} (too large: {size} bytes)")
                    continue
                if size == 0:
                    continue
            except OSError:
                continue

            yield filepath


def read_file_safe(filepath: str) -> Optional[str]:
    """Read a file with multiple encoding fallbacks."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            with open(filepath, "r", encoding=encoding, errors="strict") as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
        except Exception as e:
            log.error(f"Failed to read {filepath}: {e}")
            return None

    # Final fallback with replacement chars
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        log.error(f"Failed to read {filepath} even with replacement: {e}")
        return None


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------


class EmbeddingClient:
    """
    Client for generating embeddings. Tries the remote Embedding service first,
    falls back to local sentence-transformers if unavailable.
    """

    def __init__(
        self,
        service_url: str = EMBEDDING_SERVICE_URL,
        model_name: str = EMBEDDING_MODEL,
    ):
        self._service_url = service_url
        self._model_name = model_name
        self._local_model = None
        self._use_local = False
        self._httpx_client = None

    def _ensure_httpx(self):
        if self._httpx_client is None:
            import httpx

            self._httpx_client = httpx.Client(timeout=30.0)

    def _load_local_model(self):
        if self._local_model is None:
            try:
                from sentence_transformers import SentenceTransformer

                log.info(f"Loading local embedding model: {self._model_name}")
                self._local_model = SentenceTransformer(self._model_name)
                log.info("Local embedding model loaded successfully")
            except ImportError:
                raise RuntimeError(
                    "sentence-transformers not installed. Install with: "
                    "pip install sentence-transformers"
                )

    def embed_single(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        if not self._use_local:
            try:
                self._ensure_httpx()
                resp = self._httpx_client.post(
                    f"{self._service_url}/execute_task",
                    json={
                        "task_id": f"ingest-{uuid.uuid4().hex[:8]}",
                        "task_type": "generate_embedding",
                        "parameters": {"text": text},
                    },
                    timeout=15.0,
                )
                resp.raise_for_status()
                return resp.json()["result"]["embedding"]
            except Exception as e:
                log.warning(
                    f"Remote embedding failed ({e}), falling back to local model"
                )
                self._use_local = True

        self._load_local_model()
        return self._local_model.encode(text).tolist()

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Generate embeddings for a batch of texts."""
        if not self._use_local:
            try:
                self._ensure_httpx()
                resp = self._httpx_client.post(
                    f"{self._service_url}/execute_task",
                    json={
                        "task_id": f"ingest-batch-{uuid.uuid4().hex[:8]}",
                        "task_type": "generate_embedding_batch",
                        "parameters": {"texts": texts},
                    },
                    timeout=60.0,
                )
                resp.raise_for_status()
                return resp.json()["result"]["embeddings"]
            except Exception as e:
                log.warning(
                    f"Remote batch embedding failed ({e}), falling back to local model"
                )
                self._use_local = True

        self._load_local_model()
        all_embeddings: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = self._local_model.encode(batch).tolist()
            all_embeddings.extend(embeddings)
        return all_embeddings

    def close(self):
        if self._httpx_client:
            self._httpx_client.close()


# ---------------------------------------------------------------------------
# Qdrant Storage
# ---------------------------------------------------------------------------


class QdrantStorage:
    """Manages Qdrant vector storage for document chunks."""

    def __init__(self, url: str = QDRANT_URL, collection: str = COLLECTION_NAME):
        from qdrant_client import QdrantClient

        self._client = QdrantClient(url=url)
        self._collection = collection
        self._ensure_collection()

    def _ensure_collection(self):
        """Create collection if it doesn't exist."""
        from qdrant_client.models import Distance, VectorParams

        try:
            self._client.get_collection(self._collection)
            log.info(f"Qdrant collection '{self._collection}' exists")
        except Exception:
            self._client.create_collection(
                collection_name=self._collection,
                vectors_config=VectorParams(
                    size=VECTOR_DIM,
                    distance=Distance.COSINE,
                ),
            )
            log.info(
                f"Created Qdrant collection '{self._collection}' "
                f"(dim={VECTOR_DIM}, COSINE)"
            )

    def clear_collection(self):
        """Delete and recreate the collection."""
        from qdrant_client.models import Distance, VectorParams

        try:
            self._client.delete_collection(self._collection)
            log.info(f"Deleted collection '{self._collection}'")
        except Exception:
            pass

        self._client.create_collection(
            collection_name=self._collection,
            vectors_config=VectorParams(
                size=VECTOR_DIM,
                distance=Distance.COSINE,
            ),
        )
        log.info(f"Recreated collection '{self._collection}'")

    def check_exists(self, chunk_ids: List[str]) -> set:
        """Check which chunk IDs already exist in the collection."""
        existing = set()
        try:
            results = self._client.retrieve(
                collection_name=self._collection,
                ids=chunk_ids,
                with_payload=False,
                with_vectors=False,
            )
            existing = {str(r.id) for r in results}
        except Exception:
            pass
        return existing

    def upsert_chunks(
        self,
        chunks: List[DocumentChunk],
        embeddings: List[List[float]],
    ) -> int:
        """Upsert chunk vectors + payloads into Qdrant. Returns count upserted."""
        from qdrant_client.models import PointStruct

        if not chunks:
            return 0

        points = []
        for chunk, embedding in zip(chunks, embeddings):
            payload = {
                "content": chunk.content,
                "source_path": chunk.source_path,
                "chunk_index": chunk.chunk_index,
                "total_chunks": chunk.total_chunks,
                "content_hash": chunk.content_hash,
                "ingested_at": datetime.now(timezone.utc).isoformat(),
                **{
                    k: v
                    for k, v in chunk.metadata.items()
                    if isinstance(v, (str, int, float, bool, list))
                },
            }
            points.append(
                PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload=payload,
                )
            )

        # Upsert in batches of 100
        batch_size = 100
        upserted = 0
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            self._client.upsert(
                collection_name=self._collection,
                points=batch,
            )
            upserted += len(batch)

        return upserted

    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics."""
        try:
            info = self._client.get_collection(self._collection)
            return {
                "collection": self._collection,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count,
                "status": str(info.status),
            }
        except Exception as e:
            return {"error": str(e)}


# ---------------------------------------------------------------------------
# Neo4j Knowledge Graph Storage
# ---------------------------------------------------------------------------


class Neo4jStorage:
    """Manages Neo4j knowledge graph entries for document chunks."""

    def __init__(
        self,
        url: str = NEO4J_URL,
        user: str = NEO4J_USER,
        password: str = NEO4J_PASSWORD,
    ):
        self._driver = None
        self._url = url
        self._user = user
        self._password = password

    def _ensure_driver(self):
        if self._driver is None:
            from neo4j import GraphDatabase

            auth = (self._user, self._password) if self._password else None
            self._driver = GraphDatabase.driver(self._url, auth=auth)
            try:
                self._driver.verify_connectivity()
                log.info(f"Connected to Neo4j at {self._url}")
            except Exception as e:
                log.warning(
                    f"Neo4j connection failed ({e}). Graph indexing will be skipped."
                )
                self._driver = None

    def index_chunk(self, chunk: DocumentChunk) -> bool:
        """Index a single chunk as a Document node in Neo4j."""
        self._ensure_driver()
        if self._driver is None:
            return False

        try:
            with self._driver.session() as session:
                session.run(
                    """
                    MERGE (d:Document {id: $id})
                    SET d.source_path = $source_path,
                        d.content_hash = $content_hash,
                        d.chunk_index = $chunk_index,
                        d.total_chunks = $total_chunks,
                        d.language = $language,
                        d.line_count = $line_count,
                        d.ingested_at = datetime(),
                        d.content_preview = $preview
                    """,
                    id=chunk.chunk_id,
                    source_path=chunk.source_path,
                    content_hash=chunk.content_hash,
                    chunk_index=chunk.chunk_index,
                    total_chunks=chunk.total_chunks,
                    language=chunk.metadata.get("language", "unknown"),
                    line_count=chunk.metadata.get("line_count", 0),
                    preview=chunk.content[:200],
                )

                # Create relationship between chunks of the same file
                if chunk.chunk_index > 0:
                    prev_id = _stable_uuid(
                        f"{chunk.source_path}:{chunk.chunk_index - 1}:{chunk.content_hash}"
                    )
                    # Try linking to the previous chunk. Because the previous chunk
                    # may have a different content_hash, also try matching on path+index.
                    session.run(
                        """
                        MATCH (curr:Document {id: $curr_id})
                        OPTIONAL MATCH (prev:Document)
                            WHERE prev.source_path = $source_path
                              AND prev.chunk_index = $prev_index
                        FOREACH (p IN CASE WHEN prev IS NOT NULL THEN [prev] ELSE [] END |
                            MERGE (p)-[:NEXT_CHUNK]->(curr)
                        )
                        """,
                        curr_id=chunk.chunk_id,
                        source_path=chunk.source_path,
                        prev_index=chunk.chunk_index - 1,
                    )

                # Create SourceFile node and link
                session.run(
                    """
                    MERGE (f:SourceFile {path: $path})
                    SET f.language = $language,
                        f.total_chunks = $total_chunks
                    WITH f
                    MATCH (d:Document {id: $chunk_id})
                    MERGE (f)-[:CONTAINS_CHUNK]->(d)
                    """,
                    path=chunk.source_path,
                    language=chunk.metadata.get("language", "unknown"),
                    total_chunks=chunk.total_chunks,
                    chunk_id=chunk.chunk_id,
                )

                # Link imports/dependencies
                imports = chunk.metadata.get("imports", [])
                for imp in imports[:10]:  # cap to prevent huge graphs
                    if isinstance(imp, str) and imp.strip():
                        session.run(
                            """
                            MATCH (f:SourceFile {path: $path})
                            MERGE (dep:Module {name: $module})
                            MERGE (f)-[:IMPORTS]->(dep)
                            """,
                            path=chunk.source_path,
                            module=imp.strip(),
                        )

            return True
        except Exception as e:
            log.warning(f"Neo4j indexing failed for {chunk.chunk_id}: {e}")
            return False

    def index_chunks_batch(self, chunks: List[DocumentChunk]) -> int:
        """Index multiple chunks. Returns count successfully indexed."""
        count = 0
        for chunk in chunks:
            if self.index_chunk(chunk):
                count += 1
        return count

    def close(self):
        if self._driver:
            self._driver.close()


# ---------------------------------------------------------------------------
# Deduplication Cache (optional Redis)
# ---------------------------------------------------------------------------


class DeduplicationCache:
    """
    Cache content hashes to skip already-ingested chunks.
    Uses Redis if available, falls back to in-memory set.
    """

    def __init__(self, redis_url: str = REDIS_URL, prefix: str = "ingest:hash:"):
        self._prefix = prefix
        self._redis = None
        self._local_cache: set = set()
        self._use_local = False

        try:
            import redis as redis_lib

            self._redis = redis_lib.from_url(redis_url, decode_responses=True)
            self._redis.ping()
            log.debug("Redis dedup cache connected")
        except Exception:
            log.debug("Redis unavailable, using in-memory dedup cache")
            self._use_local = True

    def is_known(self, content_hash: str) -> bool:
        """Check if this content hash was already ingested."""
        if self._use_local:
            return content_hash in self._local_cache

        try:
            return self._redis.exists(f"{self._prefix}{content_hash}") > 0
        except Exception:
            return content_hash in self._local_cache

    def mark_known(self, content_hash: str, source_path: str = ""):
        """Mark a content hash as ingested."""
        if self._use_local:
            self._local_cache.add(content_hash)
            return

        try:
            self._redis.set(
                f"{self._prefix}{content_hash}",
                source_path,
                ex=86400 * 30,  # expire after 30 days
            )
        except Exception:
            self._local_cache.add(content_hash)

    def mark_batch(self, hashes: List[Tuple[str, str]]):
        """Mark multiple hashes as known."""
        for h, path in hashes:
            self.mark_known(h, path)


# ---------------------------------------------------------------------------
# Ingestion Pipeline
# ---------------------------------------------------------------------------


class IngestionPipeline:
    """
    Main pipeline that ties together:
    file reading → chunking → embedding → vector indexing → graph indexing
    """

    def __init__(
        self,
        chunk_strategy: str = "semantic",
        chunk_size: int = 512,
        chunk_overlap: int = 64,
        project_name: str = "constella",
        tags: Optional[List[str]] = None,
        dry_run: bool = False,
        skip_neo4j: bool = False,
        skip_dedup: bool = False,
    ):
        self.chunk_strategy = chunk_strategy
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.project_name = project_name
        self.tags = tags or []
        self.dry_run = dry_run
        self.skip_neo4j = skip_neo4j
        self.skip_dedup = skip_dedup

        if not dry_run:
            self.embedder = EmbeddingClient()
            self.qdrant = QdrantStorage()
            self.neo4j = Neo4jStorage() if not skip_neo4j else None
            self.dedup = DeduplicationCache() if not skip_dedup else None
        else:
            self.embedder = None
            self.qdrant = None
            self.neo4j = None
            self.dedup = None

    def _chunk(
        self,
        content: str,
        source_path: str,
        metadata: Dict[str, Any],
    ) -> List[DocumentChunk]:
        """Apply the configured chunking strategy."""
        strategy_fn = CHUNKING_STRATEGIES.get(self.chunk_strategy)
        if strategy_fn is None:
            raise ValueError(
                f"Unknown chunking strategy: {self.chunk_strategy}. "
                f"Available: {list(CHUNKING_STRATEGIES.keys())}"
            )

        if self.chunk_strategy == "fixed":
            return chunk_fixed_size(
                content,
                source_path,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                metadata=metadata,
            )
        elif self.chunk_strategy == "semantic":
            return chunk_semantic(
                content,
                source_path,
                chunk_size=self.chunk_size,
                metadata=metadata,
            )
        elif self.chunk_strategy == "sliding":
            return chunk_sliding_window(
                content,
                source_path,
                window_size=self.chunk_size,
                step_size=max(self.chunk_size // 2, 64),
                metadata=metadata,
            )
        else:
            return strategy_fn(
                content,
                source_path,
                chunk_size=self.chunk_size,
                metadata=metadata,
            )

    def ingest_text(
        self,
        content: str,
        source_path: str = "<stdin>",
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> IngestResult:
        """Ingest a single piece of text content."""
        t0 = time.time()

        # Detect language and extract metadata
        language = detect_language(source_path)
        metadata = extract_code_metadata(content, language)
        metadata["project"] = self.project_name
        metadata["tags"] = self.tags
        if extra_metadata:
            metadata.update(extra_metadata)

        # Chunk the content
        chunks = self._chunk(content, source_path, metadata)

        if not chunks:
            return IngestResult(
                source_path=source_path,
                chunks_created=0,
                chunks_indexed=0,
                chunks_skipped_duplicate=0,
                duration_ms=(time.time() - t0) * 1000,
            )

        if self.dry_run:
            log.info(
                f"  [DRY RUN] {source_path}: {len(chunks)} chunks, "
                f"{sum(len(c.content) for c in chunks)} chars total"
            )
            return IngestResult(
                source_path=source_path,
                chunks_created=len(chunks),
                chunks_indexed=0,
                chunks_skipped_duplicate=0,
                duration_ms=(time.time() - t0) * 1000,
            )

        # Deduplication
        skipped = 0
        chunks_to_index = chunks
        if self.dedup and not self.skip_dedup:
            chunks_to_index = []
            for chunk in chunks:
                if self.dedup.is_known(chunk.content_hash):
                    skipped += 1
                else:
                    chunks_to_index.append(chunk)

        if not chunks_to_index:
            log.debug(
                f"  {source_path}: all {len(chunks)} chunks already ingested, skipping"
            )
            return IngestResult(
                source_path=source_path,
                chunks_created=len(chunks),
                chunks_indexed=0,
                chunks_skipped_duplicate=skipped,
                duration_ms=(time.time() - t0) * 1000,
            )

        # Generate embeddings
        texts = [c.search_text for c in chunks_to_index]
        try:
            embeddings = self.embedder.embed_batch(texts)
        except Exception as e:
            log.error(f"Embedding failed for {source_path}: {e}")
            return IngestResult(
                source_path=source_path,
                chunks_created=len(chunks),
                chunks_indexed=0,
                chunks_skipped_duplicate=skipped,
                duration_ms=(time.time() - t0) * 1000,
                error=f"Embedding failed: {e}",
            )

        # Index to Qdrant
        try:
            indexed = self.qdrant.upsert_chunks(chunks_to_index, embeddings)
        except Exception as e:
            log.error(f"Qdrant indexing failed for {source_path}: {e}")
            return IngestResult(
                source_path=source_path,
                chunks_created=len(chunks),
                chunks_indexed=0,
                chunks_skipped_duplicate=skipped,
                duration_ms=(time.time() - t0) * 1000,
                error=f"Qdrant indexing failed: {e}",
            )

        # Index to Neo4j (best-effort)
        if self.neo4j:
            try:
                self.neo4j.index_chunks_batch(chunks_to_index)
            except Exception as e:
                log.warning(f"Neo4j indexing failed for {source_path}: {e}")

        # Update dedup cache
        if self.dedup:
            self.dedup.mark_batch(
                [(c.content_hash, c.source_path) for c in chunks_to_index]
            )

        duration_ms = (time.time() - t0) * 1000
        return IngestResult(
            source_path=source_path,
            chunks_created=len(chunks),
            chunks_indexed=indexed,
            chunks_skipped_duplicate=skipped,
            duration_ms=duration_ms,
        )

    def ingest_file(self, filepath: str) -> IngestResult:
        """Ingest a single file from disk."""
        content = read_file_safe(filepath)
        if content is None:
            return IngestResult(
                source_path=filepath,
                chunks_created=0,
                chunks_indexed=0,
                chunks_skipped_duplicate=0,
                duration_ms=0,
                error="Failed to read file",
            )
        return self.ingest_text(content, source_path=filepath)

    def ingest_directory(
        self,
        directory: str,
        ignore_patterns: Optional[List[str]] = None,
    ) -> IngestSummary:
        """Ingest all supported files in a directory recursively."""
        summary = IngestSummary()
        files = list(discover_files(directory, ignore_patterns))

        if not files:
            log.warning(f"No supported files found in {directory}")
            return summary

        log.info(f"Found {len(files)} files to ingest in {directory}")

        t0 = time.time()
        for i, filepath in enumerate(files, 1):
            rel = os.path.relpath(filepath, directory)
            log.info(f"  [{i}/{len(files)}] {rel}")

            result = self.ingest_file(filepath)
            summary.results.append(result)
            summary.total_sources += 1
            summary.total_chunks_created += result.chunks_created
            summary.total_chunks_indexed += result.chunks_indexed
            summary.total_chunks_skipped += result.chunks_skipped_duplicate

            if result.error:
                summary.total_errors += 1
                log.error(f"    ERROR: {result.error}")
            else:
                status_parts = [f"{result.chunks_indexed} indexed"]
                if result.chunks_skipped_duplicate > 0:
                    status_parts.append(f"{result.chunks_skipped_duplicate} deduped")
                log.info(
                    f"    → {result.chunks_created} chunks, "
                    + ", ".join(status_parts)
                    + f" ({result.duration_ms:.0f}ms)"
                )

        summary.total_duration_ms = (time.time() - t0) * 1000
        return summary

    def clear_and_reingest(
        self,
        directory: str,
        ignore_patterns: Optional[List[str]] = None,
    ) -> IngestSummary:
        """Clear the entire collection and re-ingest from scratch."""
        if not self.dry_run:
            log.warning("Clearing Qdrant collection...")
            self.qdrant.clear_collection()

        return self.ingest_directory(directory, ignore_patterns)

    def close(self):
        """Clean up resources."""
        if self.embedder:
            self.embedder.close()
        if self.neo4j:
            self.neo4j.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def print_summary(summary: IngestSummary):
    """Pretty-print the ingestion summary."""
    print("\n" + "=" * 70)
    print("  📊 INGESTION SUMMARY")
    print("=" * 70)
    print(f"  Sources processed:    {summary.total_sources}")
    print(f"  Total chunks created: {summary.total_chunks_created}")
    print(f"  Chunks indexed:       {summary.total_chunks_indexed}")
    print(f"  Chunks deduplicated:  {summary.total_chunks_skipped}")
    print(f"  Errors:               {summary.total_errors}")
    print(f"  Total time:           {summary.total_duration_ms / 1000:.1f}s")

    if summary.total_sources > 0:
        avg = summary.total_duration_ms / summary.total_sources
        print(f"  Avg per source:       {avg:.0f}ms")

    if summary.total_errors > 0:
        print("\n  ❌ Failed sources:")
        for r in summary.results:
            if r.error:
                print(f"    - {r.source_path}: {r.error}")

    print("=" * 70 + "\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Constella RAG Ingestion Pipeline — ingest files into vector + graph stores",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            examples:
              %(prog)s file services/codecraft/main.py
              %(prog)s dir ./services --project myproject --chunk-strategy semantic
              %(prog)s stdin --tags "note,todo" < notes.txt
              %(prog)s dir ./src --dry-run
              %(prog)s dir ./services --clear-collection
              %(prog)s stats
        """),
    )

    subparsers = parser.add_subparsers(dest="command", help="Ingestion command")

    # --- file subcommand ---
    file_parser = subparsers.add_parser("file", help="Ingest a single file")
    file_parser.add_argument("path", help="Path to the file to ingest")

    # --- dir subcommand ---
    dir_parser = subparsers.add_parser("dir", help="Ingest a directory recursively")
    dir_parser.add_argument("path", help="Path to the directory to ingest")
    dir_parser.add_argument(
        "--ignore", nargs="*", default=[], help="Additional ignore patterns"
    )
    dir_parser.add_argument(
        "--no-gitignore",
        action="store_true",
        help="Don't respect .gitignore files",
    )
    dir_parser.add_argument(
        "--clear-collection",
        action="store_true",
        help="Clear the collection before ingesting (full re-index)",
    )

    # --- stdin subcommand ---
    stdin_parser = subparsers.add_parser("stdin", help="Ingest text from stdin")
    stdin_parser.add_argument(
        "--source", default="<stdin>", help="Source path label for the ingested content"
    )

    # --- stats subcommand ---
    subparsers.add_parser("stats", help="Show collection statistics")

    # --- search subcommand ---
    search_parser = subparsers.add_parser("search", help="Search the knowledge base")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument(
        "--top-k", type=int, default=5, help="Number of results to return"
    )

    # --- Global options (added to all subcommands) ---
    for sub in [file_parser, dir_parser, stdin_parser]:
        sub.add_argument(
            "--project",
            default="constella",
            help="Project name for metadata (default: constella)",
        )
        sub.add_argument(
            "--tags",
            default="",
            help="Comma-separated tags (e.g. 'code,backend,api')",
        )
        sub.add_argument(
            "--chunk-strategy",
            choices=["fixed", "semantic", "sliding"],
            default="semantic",
            help="Chunking strategy (default: semantic)",
        )
        sub.add_argument(
            "--chunk-size",
            type=int,
            default=512,
            help="Maximum chunk size in characters (default: 512)",
        )
        sub.add_argument(
            "--chunk-overlap",
            type=int,
            default=64,
            help="Overlap between chunks for fixed strategy (default: 64)",
        )
        sub.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be ingested without actually writing",
        )
        sub.add_argument(
            "--skip-neo4j",
            action="store_true",
            help="Skip Neo4j graph indexing",
        )
        sub.add_argument(
            "--skip-dedup",
            action="store_true",
            help="Skip deduplication (force re-index all chunks)",
        )

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # --- stats command ---
    if args.command == "stats":
        try:
            storage = QdrantStorage()
            stats = storage.get_stats()
            print("\n📊 Qdrant Collection Statistics:")
            print(f"  Collection:    {stats.get('collection', 'N/A')}")
            print(f"  Points count:  {stats.get('points_count', 'N/A')}")
            print(f"  Vectors count: {stats.get('vectors_count', 'N/A')}")
            print(f"  Status:        {stats.get('status', 'N/A')}")
            print()
        except Exception as e:
            log.error(f"Failed to get stats: {e}")
            sys.exit(1)
        return

    # --- search command ---
    if args.command == "search":
        try:
            from qdrant_client import QdrantClient

            client = QdrantClient(url=QDRANT_URL)
            embedder = EmbeddingClient()
            vector = embedder.embed_single(args.query)
            results = client.search(
                collection_name=COLLECTION_NAME,
                query_vector=vector,
                limit=args.top_k,
            )
            print(f'\n🔍 Search: "{args.query}"')
            print("=" * 70)
            for i, hit in enumerate(results):
                print(f"\n  [{i + 1}] Score: {hit.score:.4f}")
                print(f"      Source: {hit.payload.get('source_path', 'N/A')}")
                print(f"      Language: {hit.payload.get('language', 'N/A')}")
                content = hit.payload.get("content", "")
                if len(content) > 300:
                    content = content[:300] + "..."
                print(f"      Content: {content}")
            print()
            embedder.close()
        except Exception as e:
            log.error(f"Search failed: {e}")
            sys.exit(1)
        return

    # --- Build pipeline for file/dir/stdin commands ---
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

    pipeline = IngestionPipeline(
        chunk_strategy=args.chunk_strategy,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        project_name=args.project,
        tags=tags,
        dry_run=args.dry_run,
        skip_neo4j=args.skip_neo4j,
        skip_dedup=args.skip_dedup,
    )

    try:
        if args.command == "file":
            filepath = os.path.abspath(args.path)
            if not os.path.isfile(filepath):
                log.error(f"File not found: {filepath}")
                sys.exit(1)

            log.info(f"Ingesting file: {filepath}")
            result = pipeline.ingest_file(filepath)

            summary = IngestSummary(
                total_sources=1,
                total_chunks_created=result.chunks_created,
                total_chunks_indexed=result.chunks_indexed,
                total_chunks_skipped=result.chunks_skipped_duplicate,
                total_errors=1 if result.error else 0,
                total_duration_ms=result.duration_ms,
                results=[result],
            )
            print_summary(summary)

        elif args.command == "dir":
            dirpath = os.path.abspath(args.path)
            if not os.path.isdir(dirpath):
                log.error(f"Directory not found: {dirpath}")
                sys.exit(1)

            if hasattr(args, "clear_collection") and args.clear_collection:
                log.info(f"Re-indexing directory: {dirpath}")
                summary = pipeline.clear_and_reingest(
                    dirpath,
                    ignore_patterns=args.ignore if hasattr(args, "ignore") else None,
                )
            else:
                log.info(f"Ingesting directory: {dirpath}")
                summary = pipeline.ingest_directory(
                    dirpath,
                    ignore_patterns=args.ignore if hasattr(args, "ignore") else None,
                )

            print_summary(summary)

            # Print Qdrant stats after ingestion
            if not args.dry_run:
                stats = pipeline.qdrant.get_stats()
                print(
                    f"📈 Qdrant now has {stats.get('points_count', '?')} total points\n"
                )

        elif args.command == "stdin":
            log.info("Reading from stdin...")
            content = sys.stdin.read()
            if not content.strip():
                log.error("No content received from stdin")
                sys.exit(1)

            log.info(f"Ingesting {len(content)} characters from stdin")
            result = pipeline.ingest_text(
                content,
                source_path=args.source,
            )

            summary = IngestSummary(
                total_sources=1,
                total_chunks_created=result.chunks_created,
                total_chunks_indexed=result.chunks_indexed,
                total_chunks_skipped=result.chunks_skipped_duplicate,
                total_errors=1 if result.error else 0,
                total_duration_ms=result.duration_ms,
                results=[result],
            )
            print_summary(summary)

    except KeyboardInterrupt:
        log.info("\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        log.error(f"Ingestion failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        pipeline.close()


if __name__ == "__main__":
    main()
