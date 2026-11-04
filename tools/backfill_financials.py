#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 real-fixtures.json 回填「真实历年工商年报」字段 financials。

背景：原 `adapter.ts` 的 overview.yearly 用「当前营收 × 随机增长率」反推 5 年曲线，
属编造数据。真实数据里，同一企业的年报年份数量不等（1~4 年），因此只能按真实年份
出点，缺的年份**不补**（前端按缺失处理，不做插值）。

数据源（均已落盘在 data-import/）：
  - annual_report.csv  company_id,report_year,business_income,tax_amount,total_amount,profit_amount
  - employee.csv       credit_no,report_year,employee_no
  - id_map.csv / id_map_v2.csv  company_id → credit_no

输出：给 enterprises[*] 追加
  "financials": [{"year":2023,"revenue":157994.0,"tax":414.0,"asset":310825.0,
                  "profit":16008.0,"employees":2723}, ...]   # 按 year 升序

用法：
  python3 tools/backfill_financials.py            # 就地回填并打印统计
  python3 tools/backfill_financials.py --check    # 仅校验（有企业缺 financials 则退出码 1）
"""
import csv
import json
import sys
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT = os.path.join(ROOT, 'data-import')
FIXTURES = os.path.join(ROOT, 'server', 'prisma', 'real-fixtures.json')


def load_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def num(v):
    """'157994.0万元' / '157994' / '' / '企业选择不公示' → float | None"""
    if v is None:
        return None
    s = str(v).strip().replace(',', '')
    if not s or '不公示' in s or s in ('-', '--', 'None', 'null'):
        return None
    for suffix in ('万元', '万', '元'):
        if s.endswith(suffix):
            s = s[:-len(suffix)]
            break
    try:
        return float(s)
    except ValueError:
        return None


def build():
    # company_id → credit_no
    idmap = {}
    for name in ('id_map.csv', 'id_map_v2.csv'):
        for r in load_csv(os.path.join(IMPORT, name)):
            cid, cc = r.get('company_id'), r.get('credit_no')
            if cid and cc:
                idmap[cid] = cc

    fin = defaultdict(dict)      # credit_no → {year: {...}}
    for r in load_csv(os.path.join(IMPORT, 'annual_report.csv')):
        cc = idmap.get(r.get('company_id'))
        year = (r.get('report_year') or '').strip()
        if not cc or not year.isdigit():
            continue
        fin[cc][int(year)] = {
            'revenue': num(r.get('business_income')),
            'tax': num(r.get('tax_amount')),
            'asset': num(r.get('total_amount')),
            'profit': num(r.get('profit_amount')),
            'employees': None,
        }

    for r in load_csv(os.path.join(IMPORT, 'employee.csv')):
        cc = (r.get('credit_no') or '').strip()
        year = (r.get('report_year') or '').strip()
        if not cc or not year.isdigit():
            continue
        emp = num(r.get('employee_no'))
        if emp is None:
            continue
        slot = fin[cc].setdefault(int(year), {'revenue': None, 'tax': None,
                                              'asset': None, 'profit': None,
                                              'employees': None})
        slot['employees'] = int(emp)
    return fin


def main():
    check_only = '--check' in sys.argv
    fin = build()

    with open(FIXTURES, encoding='utf-8') as f:
        data = json.load(f)
    ents = data['enterprises'] if isinstance(data, dict) else data

    stats = defaultdict(int)
    missing = []
    for e in ents:
        cc = e.get('creditCode') or ''
        years = fin.get(cc, {})
        if not years:
            missing.append(e.get('name'))
            e['financials'] = []
            stats[0] += 1
            continue
        rows = []
        blank = 0
        for y in sorted(years):
            d = years[y]
            if d.get('revenue') is None and d.get('profit') is None and d.get('asset') is None:
                continue
            row = {'year': y,
                   'revenue': d.get('revenue'),
                   'tax': d.get('tax'),
                   'asset': d.get('asset'),
                   'profit': d.get('profit'),
                   'employees': d.get('employees')}
            # 整行全空（营收/纳税/资产/净利润 全为 0 或空，且无从业人数）= 年报未填数值。
            # 这是源数据的占位写法，不是"企业当年经营归零"，全部置 None 并计数，
            # 避免前端把它画成一根 0 值柱（2026-11-05 用户拍板：此类改 null）。
            vals = [row['revenue'], row['tax'], row['asset'], row['profit']]
            if all(v in (None, 0, 0.0) for v in vals) and row['employees'] in (None, 0):
                for k in ('revenue', 'tax', 'asset', 'profit'):
                    row[k] = None
                row['employees'] = None
                blank += 1
            rows.append(row)
        if blank:
            print(f'  · {e.get("name")}: {blank} 个年度整行全空 → 置 null（视为年报未填数值）')
        e['financials'] = rows
        stats[len(rows)] += 1

    total_pts = sum(k * v for k, v in stats.items())
    print(f'企业 {len(ents)} 家；历年观测 {total_pts} 个；年数分布 {dict(sorted(stats.items()))}')
    if missing:
        print(f'⚠ 无任何年报记录 {len(missing)} 家：{", ".join(missing[:5])}…')

    if check_only:
        bad = [e['name'] for e in ents if not e.get('financials')]
        if bad:
            print(f'❌ {len(bad)} 家缺 financials')
            return 1
        print('✅ financials 齐备')
        return 0

    with open(FIXTURES, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'已写入 {FIXTURES}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
