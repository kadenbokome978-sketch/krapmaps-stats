import re

with open('tiktok_scraper.py', 'r') as f:
content = f.read()

# Fix smart quotes

content = content.replace('\u201c’, '"')
content = content.replace('\u201d’, '"')
content = content.replace('\u2018’, "'")
content = content.replace('\u2019’, "'')

# Fix indentation - replace any tab characters with 4 spaces

content = content.replace('\t’, '    ')

# Write the whole thing fresh with correct indentation

lines = content.split('\n')
fixed_lines = []
indent_level = 0

for line in lines:
stripped = line.strip()
if not stripped:
fixed_lines.append('')
continue

```
# Decrease indent for these keywords
if stripped.startswith(('return', 'pass', 'break', 'continue', 'raise')):
    pass
if stripped.startswith(('except', 'elif', 'else', 'finally')):
    indent_level = max(0, indent_level - 1)

fixed_lines.append('    ' * indent_level + stripped)

# Increase indent after these
if stripped.endswith(':') and not stripped.startswith('#'):
    indent_level += 1
# Decrease indent after return/pass at function level
if stripped.startswith(('return', 'pass', 'break', 'continue', 'raise')):
    if indent_level > 0:
        indent_level -= 1
```

content = '\n'.join(fixed_lines)

with open('tiktok_scraper.py, 'w') as f:
f.write(content)

print('Fixed quotes and indentation')
