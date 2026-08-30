# -*- coding: utf-8 -*-
import io, re
import os
s = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'public', 'engine', 'mock.js'), encoding='utf-8').read()
depth = 0
line_no = 1
first_neg = None
for line in s.split('\n'):
    t = re.sub(r"'(?:[^'\\]|\\.)*'", "''", line)
    t = re.sub(r'"(?:[^"\\]|\\.)*"', '""', t)
    t = re.sub(r'//.*$', '', t)
    for ch in t:
        if ch in '{([':
            depth += 1
        elif ch in '})]':
            depth -= 1
            if depth < 0 and first_neg is None:
                first_neg = (line_no, line.strip()[:80])
    line_no += 1
print('final depth:', depth)
print('first negative at:', first_neg)
