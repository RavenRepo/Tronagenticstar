import os
import re
from pathlib import Path

app_dir = Path("interfaces/dashboard/src/app")

replacements = {
    r'\btext-white\b': 'text-text-primary',
    r'\btext-gray-200\b': 'text-text-primary',
    r'\btext-gray-300\b': 'text-text-secondary',
    r'\btext-gray-400\b': 'text-text-secondary',
    r'\btext-gray-500\b': 'text-text-tertiary',
    r'\btext-gray-600\b': 'text-text-tertiary',
    r'\bbg-white/\[0\.02\]\b': 'bg-bg-secondary',
    r'\bbg-white/\[0\.03\]\b': 'bg-bg-secondary',
    r'\bbg-white/\[0\.01\]\b': 'bg-bg-secondary',
    r'\bbg-white/\[0\.04\]\b': 'bg-bg-hover',
    r'\bbg-white/\[0\.05\]\b': 'bg-bg-hover',
    r'\bbg-white/\[0\.06\]\b': 'bg-bg-hover',
    r'\bbg-white/\[0\.08\]\b': 'bg-bg-hover',
    r'\bbg-white/\[0\.12\]\b': 'bg-bg-active',
    r'\bbg-white/\[0\.1\]\b': 'bg-bg-active',
    r'\bborder-white/\[0\.03\]\b': 'border-border',
    r'\bborder-white/\[0\.04\]\b': 'border-border',
    r'\bborder-white/\[0\.06\]\b': 'border-border',
    r'\bborder-white/\[0\.08\]\b': 'border-border-light',
    r'\bborder-white/\[0\.12\]\b': 'border-border-light',
    r'\bbg-\[#0f1117\]\b': 'bg-bg-primary',
    r'\bbg-\[#0c0e14\]\b': 'bg-bg-primary',
    r'\bbg-black/40\b': 'bg-bg-secondary',
}

for filepath in app_dir.rglob("*.tsx"):
    if "security" in str(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    for pattern, replacement in replacements.items():
        content = re.sub(pattern, replacement, content)
        
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
