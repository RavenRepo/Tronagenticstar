import os
import re
from pathlib import Path

app_dir = Path("interfaces/dashboard/src/app")

replacements = {
    'bg-[#090b10]': 'bg-bg-primary',
    'bg-[#0f1117]': 'bg-bg-primary',    
    'text-gray-100': 'text-text-primary',
}

for filepath in app_dir.rglob("*.tsx"):
    if "security" in str(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
