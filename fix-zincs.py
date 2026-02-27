import os
import re
from pathlib import Path

app_dir = Path("interfaces/dashboard/src/app")

replacements = {
    r'\bbg-zinc-900\b': 'bg-bg-primary',
    r'\bbg-zinc-700\b': 'bg-text-tertiary',
    r'\bborder-white/\[0\.08\]\b': 'border-border',
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
