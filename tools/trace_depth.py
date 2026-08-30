# -*- coding: utf-8 -*-
import io, re
import os
s = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'public', 'engine', 'mock.js'), encoding='utf-8').read()
marks = [
    "  function enrich(",
    "  var LR = {",
    "  enrich(ENTERPRISES, POLICY_LIB, LR);",
    "  function deriveAll(",
    "  var _D = deriveAll(",
    "  var INDUSTRY_GAP = [",
    "  // AI 能力话术",
    "  var AI_CAPS = {",
    "  var DEMO_SCRIPT = [",
    "  function entById(",
    "  global.MOCK = {",
    "  global.MOCK_ENGINE = {",
]
RE_S1 = re.compile(r"'(?:[^'\\]|\\.)*'")
RE_S2 = re.compile(r'"(?:[^"\\]|\\.)*"')
RE_C = re.compile(r'//.*$')
depth = 0
line_no = 1
found = {}
for line in s.split('\n'):
    for m in marks:
        if line.startswith(m) and m not in found:
            found[m] = (line_no, depth)
    t = RE_S1.sub("''", line)
    t = RE_S2.sub('""', t)
    t = RE_C.sub('', t)
    for ch in t:
        if ch in '{(':
            depth += 1
        elif ch in '})':
            depth -= 1
    for m in marks:
        if line.startswith(m) and m not in found:
            found[m] = (line_no, depth)
    line_no += 1
for m in marks:
    print(m, '->', found.get(m))
print('final depth:', depth)
