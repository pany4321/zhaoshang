#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
由真实工商数据生成平台后端 fixtures
输入：data-import/enterprises.csv（Doris opt_company_base 导出，庆阳 8 区县真实企业）
输出：server/prisma/real-fixtures.json

设计原则：
  1. 企业主体的工商字段全部来自真实数据（名称/信用代码/法人/成立日期/注册资本/区县）
  2. 行业、规模、风险维度、招商经营指标由确定性规则推导（同企业每次结果一致，不用随机数）
  3. 风险分做分位校准，保证红/橙/黄/蓝四级分布合理，且维度分与加权总分自洽
  4. 风险事件 / 招商项目 / 任务 为招商业务内部数据，基于真实企业按规则生成
  5. 政策保持原 demo 数据集（业务方确认可用模拟）
"""
import csv, json, hashlib, math, os
from collections import Counter
from datetime import date, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, 'data-import/enterprises.csv')
DEMO_FIX = os.path.join(BASE, 'server/prisma/demo-fixtures.json')
OUT_PATH = os.path.join(BASE, 'server/prisma/real-fixtures.json')

DIST_MAP = {
    '西峰区': 'xf', '庆城县': 'qc', '环县': 'hj', '华池县': 'hn',
    '合水县': 'hy', '正宁县': 'zq', '宁县': 'ning', '镇原县': 'zx',
}

# 行业关键词（顺序即优先级：具体行业优先于泛化行业）
INDUSTRY_RULES = [
    ('software',  ['软件', '信息技术', '数据服务', '大数据', '智算', '网络科技', '互联网', '数字产业', '科技服务', '智能科技', '信息科技']),
    ('neequip',   ['新能源', '风电', '光伏', '储能', '太阳能', '氢能', '风力发电']),
    ('oilgas',    ['石油', '煤炭', '煤业', '煤电', '煤矿', '天然气', '发电', '电力', '热力', '燃气', '勘探', '矿业', '能源化工', '煤层气']),
    ('chemical',  ['化工', '化学', '新材料', '碳材料', '助剂', '肥业', '石油科技']),
    ('biomed',    ['医药', '药业', '生物科技', '医疗器械', '健康产业']),
    ('agriequip', ['农机', '农业机械', '农业装备']),
    ('agrifood',  ['食品', '农牧', '羊乳', '肉羊', '羊羔肉', '果', '酒业', '养殖', '种植', '粮油', '果蔬', '农业', '乳业', '田园']),
    ('culture',   ['文化', '旅游', '文旅', '传媒', '红色', '游乐园', '体育', '文创']),
    ('logistics', ['物流', '运输', '公路', '机场', '仓储', '货运', '高速']),
    ('wholesale', ['批发', '贸易', '销售', '商贸', '电子商务', '进出口', '零售']),
    ('building',  ['建材', '建筑', '房地产', '工程', '建设', '劳务', '水泥', '非金属', '装饰', '置业']),
    ('genequip',  ['机械', '制造', '设备', '装备', '管业', '机电']),
]

IND_RISK = {
    'building': 1.22, 'chemical': 1.14, 'oilgas': 1.10, 'logistics': 1.06,
    'genequip': 1.02, 'agrifood': 1.00, 'wholesale': 1.00, 'agriequip': 0.98,
    'neequip': 0.95, 'biomed': 0.95, 'software': 0.86, 'culture': 0.88,
}

SOE_KEYS = ['国有', '投资集团', '城投', '发展投资', '国有资产', '水务', '公路',
            '交通投资', '城乡建设', '城市发展', '投资开发', '投资建设', '投资发展',
            '信用合作联社', '供水', '热力']

# 投资平台 / 城投类：注册资本大但营收规模相对小
PLATFORM_KEYS = ['投资集团', '投资发展', '投资开发', '投资建设', '国有资产', '城投',
                 '城乡建设', '城市发展', '水务', '公路', '交通投资', '供水', '热力',
                 '项目管理', '投资有限', '发展投资', '国有资产投资']
# 重资产类：营收/资本比中等
HEAVY_KEYS = ['发电', '电力', '煤电', '能源', '矿业', '勘探', '水泥', '化工', '煤业']

W = {'op': 0.20, 'fin': 0.15, 'legal': 0.15, 'credit': 0.15,
     'tender': 0.10, 'tax': 0.10, 'commit': 0.10, 'ip': 0.05}
DIM_NAME = {'op': '经营风险', 'fin': '财务风险', 'legal': '司法风险', 'credit': '信用风险',
            'tender': '招投标风险', 'tax': '税务风险', 'commit': '招商履约风险', 'ip': '知识产权风险'}
KEY_MAP = {'op': 'riskOp', 'fin': 'riskFin', 'legal': 'riskLegal', 'credit': 'riskCredit',
           'tender': 'riskTender', 'tax': 'riskTax', 'commit': 'riskCommit', 'ip': 'riskIp'}

TODAY = date.today()
# 注：企业年龄（age）与「新增企业」判断用真实当天日期，跨年自动正确；
#     任务 dueDate / 项目 startDate 等演示日期另用固定 2026 字面量，保持演示数据稳定。

# 年报未公示的财务字段（保留企业名用于审计输出；这些字段一律记 0，不推导）
MISSING_FIELDS = {}


def dh(*parts) -> int:
    h = hashlib.md5('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()
    return int(h[:8], 16) % 10000


def pick_industry(name: str, scope: str) -> str:
    text = f'{name} {scope or ""}'
    for key, kws in INDUSTRY_RULES:
        for kw in kws:
            if kw in text:
                return key
    return 'wholesale'


def scale_of(cap: float) -> str:
    if cap >= 100000: return '大型企业'
    if cap >= 10000:  return '中型企业'
    if cap >= 1000:   return '小型企业'
    return '微型企业'


def clamp(v, lo=0, hi=100) -> int:
    return int(max(lo, min(hi, round(v))))


def raw_risks(name, cap, est_year, ind, seed):
    """八维原始风险分（未校准）：基于真实工商属性的确定性推导"""
    age = TODAY.year - est_year
    is_soe = any(k in name for k in SOE_KEYS)
    cap_ = max(cap, 10.0)

    size_f = 1.0 - min(0.34, math.log10(cap_) / 7.4)
    age_f = 1.30 if age <= 2 else (1.14 if age <= 5 else (0.94 if age >= 15 else 1.0))
    soe_f = 0.72 if is_soe else 1.0
    base = 58.0 * size_f * age_f * soe_f
    ir = IND_RISK.get(ind, 1.0)

    def j(k, spread=6.5):
        return ((dh(seed, k) / 9999.0) - 0.5) * 2 * spread

    r = {
        'op':     max(3.0, base * 1.05 * ir + j('op')),
        'fin':    max(3.0, base * 1.16 * (1.13 if cap < 5000 else 1.0) + j('fin')),
        'legal':  max(3.0, base * 1.08 * (1.40 if ind == 'building' else 1.0) + j('legal')),
        'credit': max(3.0, base * 0.90 + j('credit')),
        'tender': max(2.0, base * 0.78 * (1.22 if cap >= 50000 else 0.82) + j('tender')),
        'tax':    max(2.0, base * 1.00 * (1.18 if cap < 8000 else 0.90) + j('tax')),
        'commit': max(2.0, base * 0.94 * (1.26 if age <= 3 else 0.86) + j('commit')),
        'ip':     max(1.5, base * 0.60 * (0.68 if ind in ('software', 'biomed', 'neequip') else 1.12) + j('ip')),
    }
    if is_soe:
        for k in ('legal', 'credit', 'tax'):
            r[k] *= 0.74
    return r


def build_ops(cap, name, seed):
    """招商经营指标：按企业类型 + 注册资本确定性推导（水滴信用不含此类内部经营数据）"""
    is_platform = any(k in name for k in PLATFORM_KEYS)
    is_heavy = any(k in name for k in HEAVY_KEYS)
    if is_platform:
        lo, hi = 0.12, 0.42
    elif is_heavy:
        lo, hi = 0.55, 1.35
    else:
        lo, hi = 1.15, 2.55
    k = lo + (dh(seed, 'rev') / 9999.0) * (hi - lo)
    revenue = round(min(cap * k, 1_200_000.0), 1)
    tax = round(revenue * (0.045 + (dh(seed, 'tax') / 9999.0) * 0.030), 1)
    investment = round(cap * (0.80 + (dh(seed, 'inv') / 9999.0) * 0.70), 1)
    employees = max(9, int(revenue / (40 + (dh(seed, 'emp') / 9999.0) * 36)))
    land_mu = round(investment / (230 + (dh(seed, 'land') / 9999.0) * 170), 1)
    perform = 78 + dh(seed, 'perf') % 21
    return revenue, tax, investment, employees, land_mu, perform


def calibrate_target(rank_p: float) -> float:
    """按排名百分位给出目标综合风险分（red≥65 / orange≥45 / yellow≥25 / blue<25）"""
    if rank_p >= 0.95:   return 68 + (rank_p - 0.95) / 0.05 * 16      # 68~84  red
    if rank_p >= 0.77:   return 47 + (rank_p - 0.77) / 0.18 * 17      # 47~64  orange
    if rank_p >= 0.32:   return 27 + (rank_p - 0.32) / 0.45 * 17      # 27~44  yellow
    return 9 + (rank_p / 0.32) * 16                                    # 9~25   blue


def load_partners():
    """读取真实股东数据（Doris opt_ent_partner_std 导出），按信用代码归集
    返回 {credit_no: [{name, ratio, sort}, ...]}，ratio 为百分比整数
    """
    import glob
    agg = {}
    for f in sorted(glob.glob(os.path.join(BASE, 'data-import/partners/*.csv'))):
        with open(f, encoding='utf-8-sig', newline='') as fh:
            for r in csv.DictReader(fh):
                cc = (r.get('credit_no') or '').strip()
                nm = (r.get('stock_name') or '').strip()
                if not cc or not nm or nm in ('<nil>', 'None'):
                    continue
                raw = (r.get('stock_proportion') or '').strip()
                try:
                    prop = float(raw) if raw not in ('', '<nil>', 'None') else 0.0
                except ValueError:
                    prop = 0.0
                agg.setdefault(cc, []).append({'name': nm, 'ratio': round(prop * 100)})

    for cc, lst in agg.items():
        # 同一股东去重（保留比例最高的一条）
        best = {}
        for s in lst:
            if s['name'] not in best or s['ratio'] > best[s['name']]['ratio']:
                best[s['name']] = s
        lst = sorted(best.values(), key=lambda x: -x['ratio'])
        # 全部比例缺失时，视为单一控股股东
        if lst and sum(s['ratio'] for s in lst) == 0:
            lst[0]['ratio'] = 100
        else:
            # 剔除比例为 0 的记录：源数据未公示比例，不代表真实零持股
            valid = [s for s in lst if s['ratio'] > 0]
            if valid:
                lst = valid
        # 限制展示数量，避免极端分散的股权表撑爆页面
        lst = lst[:10]
        for i, s in enumerate(lst):
            s['sort'] = i
        agg[cc] = lst
    return agg


def _rows(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8-sig', newline='') as f:
        return [r for r in csv.DictReader(f) if any((v or '').strip() for v in r.values())]


def _int(v):
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return 0


def load_risk_metrics():
    """司法与招投标硬指标（按 credit_no 归集）"""
    import glob
    m = {}

    def put(cc, key, val):
        m.setdefault(cc, {})[key] = val

    for r in _rows(os.path.join(BASE, 'data-import/risk/judicial_case.csv')):
        cc = (r.get('credit_no') or '').strip()
        if cc:
            put(cc, 'judicialCount', _int(r.get('case_cnt')))
    for r in _rows(os.path.join(BASE, 'data-import/risk/zhixing.csv')):
        cc = (r.get('credit_no') or '').strip()
        if cc:
            put(cc, 'zhixingCount', _int(r.get('zhixing_cnt')))
    for r in _rows(os.path.join(BASE, 'data-import/risk/shixin.csv')):
        cc = (r.get('credit_no') or '').strip()
        if cc:
            put(cc, 'shixinCount', _int(r.get('shixin_cnt')))
    for f in glob.glob(os.path.join(BASE, 'data-import/risk/bid_*.csv')):
        for r in _rows(f):
            cc = (r.get('credit_no') or '').strip()
            if cc:
                put(cc, 'bidCount', _int(r.get('bid_cnt')))
    return m


def load_ip_metrics(ent_names):
    """知识产权（专利/商标）：按申请人名称匹配，支持 ';' 分隔的联合申请人"""
    pat, tm = {}, {}
    for r in _rows(os.path.join(BASE, 'data-import/ip/patent.csv')):
        nm = (r.get('applicant_name') or '').strip()
        if nm:
            pat[nm] = (_int(r.get('patent_cnt')), _int(r.get('invention_cnt')))
    for r in _rows(os.path.join(BASE, 'data-import/ip/trademark.csv')):
        nm = (r.get('applicant_cn') or '').strip()
        if nm:
            tm[nm] = _int(r.get('trademark_cnt'))

    def split_keys(k):
        return [p.strip() for p in k.replace('；', ';').split(';')] if (';' in k or '；' in k) else [k]

    out = {}
    for name in ent_names:
        pc = inv = tc = 0
        for k, (p, i) in pat.items():
            if name in split_keys(k):
                pc += p; inv += i
        for k, t in tm.items():
            if name in split_keys(k):
                tc += t
        out[name] = {'patentCount': pc, 'inventionCount': inv, 'trademarkCount': tc}
    return out


def load_national_industry():
    """读取官方国标行业分类（Doris company_industry 导出，2017 国民经济行业分类）

    返回 {credit_no: {'l1': 门类, 'l2': 大类, 'l3': 小类}}
    与关键词推导的 industryId（招商视角 12 个产业）并存：
    招商汇报用 industryId，对上统计报送与外部核验用 nationalIndustry。
    """
    path = os.path.join(BASE, 'data-import/national/company_industry.csv')
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8-sig', newline='') as fh:
        for r in csv.DictReader(fh):
            cc = (r.get('credit_no') or '').strip()
            if not cc:
                continue

            def clean(k):
                v = (r.get(k) or '').strip()
                return None if v in ('', '<nil>', 'None') else v

            out[cc] = {
                'l1': clean('industry_l1_name'),
                'l2': clean('industry_l2_name'),
                'l3': clean('industry_l3_name'),
            }
    return out


def load_financials():
    """工商年报公示的真实财务数据：{credit_no: {year, revenue, tax, asset, profit}}

    数据源：Doris annual_report_asset（values 形如 "25610.86万元"）
    仅取营业收入 > 0 的企业——营收为 0 的记录多为填报异常（例如营收 0 却有上千万纳税），
    这类企业整条不采纳，保留推导值，避免把异常数据带进页面统计。
    """
    import re as _re
    ar_path = os.path.join(BASE, 'data-import', 'annual_report.csv')
    id_path = os.path.join(BASE, 'data-import', 'id_map.csv')
    if not (os.path.exists(ar_path) and os.path.exists(id_path)):
        print('  ! 未找到年报财务数据，营收/纳税全部沿用推导值')
        return {}

    idmap = {r['company_id']: r['credit_no']
             for r in csv.DictReader(open(id_path, encoding='utf-8')) if r.get('company_id')}

    def num(v):
        if not v:
            return None
        m = _re.match(r'^(-?[0-9]+(?:\.[0-9]+)?)万元$', str(v).strip())
        return float(m.group(1)) if m else None

    best = {}
    for r in csv.DictReader(open(ar_path, encoding='utf-8')):
        cc = idmap.get(r.get('company_id'))
        if not cc:
            continue
        try:
            y = int(r.get('report_year') or 0)
        except ValueError:
            continue
        rev = num(r.get('business_income'))
        # ★ 只在「公示了数值型营收且 > 0」的年份里挑最新的一年。
        #   旧实现先取最新年份、再判断营收是否为空：把「早年有营收、最新年未公示」
        #   的企业整条丢掉，退化成规则推导值（120 家样本里曾因此混入 95 家推导值）。
        if not (rev and rev > 0):
            continue
        cur = best.get(cc)
        if cur and y <= cur['year']:
            continue
        best[cc] = {
            'year': y,
            'revenue': rev,
            'tax': num(r.get('tax_amount')),
            'asset': num(r.get('total_amount')),
            'profit': num(r.get('profit_amount')),
        }
    return best


def load_records():
    """企业档案记录：行政处罚/经营异常/股权出质/动产抵押/分支机构

    返回 {credit_no: [ {type,title,detail,occurDate,amount}, ... ]}
    数据源：data-import/records/*.csv（Doris 导出，company_id 经 id_map 映射回信用代码）
    """
    import re as _re
    id_path = os.path.join(BASE, 'data-import', 'id_map.csv')
    rec_dir = os.path.join(BASE, 'data-import', 'records')
    if not (os.path.exists(id_path) and os.path.isdir(rec_dir)):
        print('  ! 未找到企业档案数据（records/），跳过处罚/异常/出质/抵押/分支')
        return {}

    idmap = {r['company_id']: r['credit_no']
             for r in csv.DictReader(open(id_path, encoding='utf-8')) if r.get('company_id')}

    def num(v):
        if not v:
            return None
        m = _re.match(r'^(-?[0-9]+(?:\.[0-9]+)?)万元$', str(v).strip())
        return float(m.group(1)) if m else None

    def rows(name):
        p = os.path.join(rec_dir, name)
        if not os.path.exists(p):
            return []
        return list(csv.DictReader(open(p, encoding='utf-8')))

    def clean(d):
        return {k: (str(v).strip() if v is not None else '') for k, v in d.items()}

    out = {}

    def put(cid, rec):
        cc = idmap.get(str(cid or '').strip())
        if not cc:
            return
        out.setdefault(cc, []).append(rec)

    for r in rows('punish.csv'):
        amt = num(r.get('punish_amount'))
        put(r.get('company_id'), {
            'type': 'punish',
            'title': (r.get('punish_type') or '行政处罚').strip() or '行政处罚',
            'detail': json.dumps(clean({
                '违法事实': r.get('illegal_fact'),
                '处罚内容': r.get('punish_content'),
                '处罚机关': r.get('authority'),
                '罚没金额': r.get('amount_forfeiture'),
            }), ensure_ascii=False),
            'occurDate': (r.get('punish_date') or '').strip() or None,
            'amount': amt,
        })

    for r in rows('abnormal.csv'):
        removed = (r.get('removed_date') or '').strip()
        put(r.get('company_id'), {
            'type': 'abnormal',
            'title': (r.get('included_reason') or '列入经营异常名录').strip() or '列入经营异常名录',
            'detail': json.dumps(clean({
                '列入机关': r.get('included_authority'),
                '移出日期': removed or '—',
                '移出原因': r.get('removed_reason'),
                '当前状态': '已移出' if removed else '仍在经营异常名录',
            }), ensure_ascii=False),
            'occurDate': (r.get('included_date') or '').strip() or None,
            'amount': None,
        })

    for r in rows('pledge.csv'):
        put(r.get('company_id'), {
            'type': 'pledge',
            'title': '股权出质登记',
            'detail': json.dumps(clean({
                '出质人': r.get('pledgor'),
                '质权人': r.get('pawnee'),
                '出质股权': r.get('pledge_equity'),
                '登记状态': r.get('pledge_status'),
                '登记编号': r.get('pledge_code'),
            }), ensure_ascii=False),
            'occurDate': (r.get('pledge_date') or '').strip() or None,
            'amount': None,
        })

    for r in rows('chattel.csv'):
        put(r.get('company_id'), {
            'type': 'chattel',
            'title': '动产抵押登记',
            'detail': json.dumps(clean({
                '抵押权人': r.get('mortgagee'),
                '登记编号': r.get('chattel_code'),
                '抵押权人证件号': r.get('mortgagee_identify_no'),
            }), ensure_ascii=False),
            'occurDate': None,
            'amount': None,
        })

    for r in rows('branch.csv'):
        put(r.get('company_id'), {
            'type': 'branch',
            'title': (r.get('branch_name') or '分支机构').strip() or '分支机构',
            'detail': json.dumps(clean({
                '统一社会信用代码': r.get('branch_credit_no'),
                '经营状态': r.get('company_status'),
                '负责人': r.get('legal_person'),
            }), ensure_ascii=False),
            'occurDate': (r.get('establish_date') or '').strip() or None,
            'amount': None,
        })

    return out


def load_judicial_cases():
    """司法案件明细（按 credit_no 归集）；party_role 为 JSON 数组文本，需解析"""
    m = {}
    for r in _rows(os.path.join(BASE, 'data-import/risk/judicial_detail.csv')):
        cc = (r.get('credit_no') or '').strip()
        if not cc:
            continue

        role_raw = (r.get('party_role') or '').strip()
        role = role_raw
        if role_raw.startswith('['):
            try:
                roles = json.loads(role_raw.replace("'", '"'))
                if isinstance(roles, list):
                    role = '、'.join(str(x) for x in roles)
            except Exception:
                role = role_raw
        if role in ('<nil>', 'None'):
            role = ''

        def clean(k, maxlen=None):
            v = (r.get(k) or '').strip()
            if v in ('<nil>', 'None', ''):
                return None
            return v[:maxlen] if maxlen else v

        tt = clean('trial_time')
        m.setdefault(cc, []).append({
            'title': clean('title', 160),
            'caseCode': clean('case_code', 120),
            'caseReason': clean('case_reason', 60),
            'partyRole': role or None,
            'procedure': clean('trial_procedure'),
            'trialTime': tt[:10] if tt else None,
            'typeTags': clean('type_tags', 120),
        })

    for cc in m:
        m[cc].sort(key=lambda x: x['trialTime'] or '', reverse=True)
        m[cc] = m[cc][:8]
    return m


def main():
    with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.DictReader(f) if r.get('company_name')]

    # 过滤脏行（district 缺失）并按信用代码去重
    seen, uniq = set(), []
    for r in rows:
        cc = (r.get('credit_no') or '').strip()
        dist = (r.get('district') or '').strip()
        if not cc or cc in seen or dist not in DIST_MAP:
            continue
        seen.add(cc)
        uniq.append(r)

    # 新口径：enterprises.csv 已是「有真实年报财务数据」的筛选结果，
    # 各区数量按实际可得分配（不强制均等），不再截断为 120 家
    picked = list(uniq)

    demo = json.load(open(DEMO_FIX, encoding='utf-8'))
    partners = load_partners()
    risk_metrics = load_risk_metrics()
    ip_metrics = load_ip_metrics([r['company_name'].strip() for r in picked])
    cases_map = load_judicial_cases()
    financials = load_financials()
    national_industry = load_national_industry()
    records_map = load_records()
    enterprises, raws, judicial_cases = [], [], []
    jid = 0

    for i, r in enumerate(picked, 1):
        name = r['company_name'].strip()
        cc = r['credit_no'].strip()
        est = (r.get('establish_date') or '').strip()[:10]
        est_year = int(est[:4]) if est[:4].isdigit() else 2010
        try:
            cap = float(r.get('capital_num') or 0)
        except (ValueError, TypeError):
            cap = 0.0
        ind = pick_industry(name, r.get('business_scope', ''))
        dist = DIST_MAP[r['district'].strip()]
        seed = cc

        risks = raw_risks(name, cap, est_year, ind, seed)
        revenue, tax, investment, employees, land_mu, perform = build_ops(cap, name, seed)

        # 年报公示的真实财务值优先：营收>0 时整条采纳（营收/纳税/资产/净利润同源同年）
        asset_total, net_profit, fin_year = 0.0, 0.0, None
        _fin = financials.get(cc)
        if _fin and _fin.get('revenue') and _fin['revenue'] > 0:
            fin_year = str(_fin['year'])
            # ★ 一旦有真实年报，财务四项全部取年报值；年报未公示的字段记 0，
            #   绝不回落到 build_ops() 的规则推导值——宁可显示 0，也不拿推导值冒充真实数。
            #   （旧实现 tax/profit 为 None 时保留推导值，曾使 1 家纳税额被推导污染）
            revenue = round(_fin['revenue'], 1)
            tax = round(max(0.0, _fin.get('tax') or 0.0), 1)
            asset_total = round(max(0.0, _fin.get('asset') or 0.0), 1)
            net_profit = round(_fin.get('profit') or 0.0, 1)
            if _fin.get('tax') is None:
                MISSING_FIELDS.setdefault('tax', []).append(name)
            if _fin.get('asset') is None:
                MISSING_FIELDS.setdefault('asset', []).append(name)
            if _fin.get('profit') is None:
                MISSING_FIELDS.setdefault('profit', []).append(name)

        is_new = est_year >= TODAY.year - 1
        eid = f'E{i:03d}'

        enterprises.append({
            'id': eid, 'name': name, 'creditCode': cc,
            'legal': (r.get('legal_person') or '').strip() or '—',
            'found': est, 'scale': scale_of(cap), 'bizStatus': '在营',
            'creditStatus': '', 'regCapital': f'{int(cap)}万元' if cap >= 1 else f'{cap}万元',
            'districtId': dist, 'industryId': ind,
            # 官方国标行业（A 类事实数据），与 industryId 并存
            'nationalIndustryL1': (national_industry.get(cc) or {}).get('l1'),
            'nationalIndustry': (national_industry.get(cc) or {}).get('l2'),
            'nationalIndustryL3': (national_industry.get(cc) or {}).get('l3'),
            'isKey': bool(cap >= 50000 or '集团' in name), 'isNew': is_new,
            'newDate': est if is_new else None,
            'revenue': revenue, 'tax': tax, 'investment': investment,
            'employees': employees, 'landMu': land_mu,
            'performRate': perform, 'commitRate': None,
            'riskScore': 0, 'riskLevel': 'blue',
            **{KEY_MAP[k]: 0 for k in W},
            'shareholders': partners.get(cc, []),
            'patentCount': ip_metrics.get(name, {}).get('patentCount', 0),
            'inventionCount': ip_metrics.get(name, {}).get('inventionCount', 0),
            'trademarkCount': ip_metrics.get(name, {}).get('trademarkCount', 0),
            'judicialCount': risk_metrics.get(cc, {}).get('judicialCount', 0),
            'zhixingCount': risk_metrics.get(cc, {}).get('zhixingCount', 0),
            'shixinCount': risk_metrics.get(cc, {}).get('shixinCount', 0),
            'bidCount': risk_metrics.get(cc, {}).get('bidCount', 0),
            'assetTotal': asset_total,
            'netProfit': net_profit,
            'finYear': fin_year,
            'records': records_map.get(cc, []),
        })

        # 司法案件明细（每家最多 8 条，已按审判时间倒序）
        for c in cases_map.get(cc, []):
            jid += 1
            judicial_cases.append({'id': f'J{jid:04d}', 'enterpriseId': eid, **c})

        raws.append(risks)

    # ---- 风险分位校准：维度分整体缩放，使加权总分落在目标区间（保持自洽）----
    raw_totals = [sum(raws[i][k] * W[k] for k in W) for i in range(len(raws))]
    order = sorted(range(len(raw_totals)), key=lambda i: raw_totals[i])
    n = len(order)
    for rank, idx in enumerate(order):
        p = rank / (n - 1) if n > 1 else 0.5
        target = calibrate_target(p)
        rt = raw_totals[idx]
        factor = (target / rt) if rt > 1e-6 else 1.0
        ent = enterprises[idx]
        for k in W:
            ent[KEY_MAP[k]] = clamp(raws[idx][k] * factor)
        score = round(sum(ent[KEY_MAP[k]] * w for k, w in W.items()))
        ent['riskScore'] = score
        ent['riskLevel'] = 'red' if score >= 65 else ('orange' if score >= 45 else ('yellow' if score >= 25 else 'blue'))
        ent['creditStatus'] = '较差' if score >= 65 else ('关注' if score >= 45 else '良好')

    # ---------- 风险事件 67 条 ----------
    pool = sorted(enterprises, key=lambda e: -e['riskScore'])
    STATUS_PLAN = ['pending'] * 9 + ['doing'] * 31 + ['done'] * 27
    events, ei = [], 0
    for ent in pool:
        if ei >= len(STATUS_PLAN):
            break
        dims_sorted = sorted(W.keys(), key=lambda k: -ent[KEY_MAP[k]])
        cnt = 2 if ent['riskScore'] >= 55 and ei + 1 < len(STATUS_PLAN) else 1
        for j in range(cnt):
            if ei >= len(STATUS_PLAN):
                break
            dk = dims_sorted[j] if j < len(dims_sorted) else dims_sorted[0]
            dv = ent[KEY_MAP[dk]]
            lvl = 'red' if dv >= 75 else ('orange' if dv >= 58 else ('yellow' if dv >= 40 else 'blue'))
            mm = 1 + dh(ent['creditCode'], 'date', ei) % 9
            dd = 1 + dh(ent['creditCode'], 'day', ei) % 27
            events.append({
                'id': f'R{ei+1:03d}',
                'title': f'{DIM_NAME[dk]}提示：{ent["name"][:14]}',
                'dimension': dk, 'dimensionName': DIM_NAME[dk], 'level': lvl,
                'status': STATUS_PLAN[ei], 'enterpriseId': ent['id'],
                'districtId': ent['districtId'], 'foundDate': f'2026-{mm:02d}-{dd:02d}',
                'detail': f'{ent["name"]}在{DIM_NAME[dk]}维度识别到异常信号（模型评分 {dv}），建议属地部门核实企业经营状况。',
                'suggestion': {
                    'op': '实地走访企业，核实产能与订单情况',
                    'fin': '核查企业现金流与负债结构，评估偿付能力',
                    'legal': '跟进涉诉案件进展，评估对经营的影响',
                    'credit': '核实失信与行政处罚记录，督促信用修复',
                    'tender': '核查招投标履约记录，关注围标串标风险',
                    'tax': '协同税务部门核实申报与欠税情况',
                    'commit': '核对投资强度与建设进度，督促履约',
                    'ip': '排查专利与商标纠纷，关注侵权风险',
                }[dk],
            })
            ei += 1

    # ---------- 招商项目 19 个 ----------
    proj_pool = sorted(enterprises, key=lambda e: (not e['isNew'], -e['revenue']))[:19]
    STAGES = ['线索对接', '深度洽谈', '签约落地', '建设推进', '投产运营', '达产评价']
    STAGE_DIST = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 2, 3, 4, 1]
    ORGS = ['市招商局', '西峰区招商服务中心', '庆城县招商局', '环县招商服务中心',
            '华池县招商局', '合水县招商服务中心', '正宁县招商局', '宁县招商服务中心', '镇原县招商局']
    projects = []
    for i, ent in enumerate(proj_pool):
        st = STAGE_DIST[i] if i < len(STAGE_DIST) else (i % 6)
        projects.append({
            'id': f'P{i+1:03d}', 'name': f'{ent["name"]}项目', 'enterpriseId': ent['id'],
            'stage': st, 'stageName': STAGES[st],
            'progress': [8, 25, 45, 68, 88, 100][st],
            'investment': ent['investment'], 'districtId': ent['districtId'],
            'industryId': ent['industryId'], 'org': ORGS[dh(ent['creditCode'], 'org') % 9],
            'contact': ent['legal'], 'riskLevel': ent['riskLevel'], 'riskScore': ent['riskScore'],
            'startDate': f'2026-{1 + dh(ent["creditCode"], "ps") % 8:02d}-{1 + dh(ent["creditCode"], "pd") % 27:02d}',
            'stage1Detail': None, 'stage2Detail': None, 'stage3Detail': None,
            'stage4Detail': None, 'stage5Detail': None, 'stage6Detail': None,
            'lastContact': f'2026-{9 + dh(ent["creditCode"], "lc") % 2:02d}-{1 + dh(ent["creditCode"], "lcd") % 27:02d}',
        })

    # ---------- 任务 78 条 ----------
    TASK_PLAN = (['risk'] * 58) + (['policy'] * 8) + (['service'] * 5) + (['project'] * 4) + (['patrol'] * 3)
    tasks, tid = [], 0
    for plan_type in TASK_PLAN:
        tid += 1
        if plan_type == 'risk' and tid <= len(events):
            ev = events[tid - 1]
            ent = next(e for e in enterprises if e['id'] == ev['enterpriseId'])
            t = {'id': tid, 'title': f'【风险处置】{ev["title"]}',
                 'type': 'risk', 'priority': 'high' if ev['level'] == 'red' else 'normal',
                 'status': {'pending': 'pending', 'doing': 'doing', 'done': 'done'}[ev['status']],
                 'dueDate': f'2026-11-{1 + (tid % 27):02d}', 'createdAt': ev['foundDate'],
                 'finishedAt': ev['foundDate'] if ev['status'] == 'done' else None,
                 'description': ev['suggestion'],
                 'processLog': '已派发至属地负责人' if ev['status'] != 'pending' else None,
                 'enterpriseId': ent['id'], 'projectId': None,
                 'assignee': ['admin', 'zhaoshang01', 'leader'][tid % 3],
                 'source': ev['id']}
            # taskId 由 seed 阶段 riskEvent.connect 自动回填，fixtures 中不写（避免外键冲突）
        elif plan_type == 'policy':
            ent = enterprises[(tid * 7) % len(enterprises)]
            t = {'id': tid, 'title': f'【政策推送】向{ent["name"][:16]}推送惠企政策',
                 'type': 'policy', 'priority': 'normal',
                 'status': ['done', 'doing', 'done'][tid % 3],
                 'dueDate': '2026-11-15', 'createdAt': '2026-10-08',
                 'finishedAt': '2026-10-15' if tid % 3 == 0 else None,
                 'description': '匹配适配政策并推送企业', 'processLog': None,
                 'enterpriseId': ent['id'], 'projectId': None, 'assignee': 'zhaoshang01',
                 'source': '政策匹配'}
        elif plan_type == 'service':
            ent = enterprises[(tid * 11) % len(enterprises)]
            t = {'id': tid, 'title': f'【企业服务】{ent["name"][:16]}诉求响应',
                 'type': 'service', 'priority': 'normal', 'status': 'doing',
                 'dueDate': '2026-11-20', 'createdAt': '2026-10-12', 'finishedAt': None,
                 'description': '协调解决企业反映的用工与审批问题', 'processLog': '已联系企业对接人',
                 'enterpriseId': ent['id'], 'projectId': None, 'assignee': 'admin', 'source': '企业诉求'}
        elif plan_type == 'project':
            pr = projects[tid % len(projects)]
            t = {'id': tid, 'title': f'【项目跟进】{pr["name"]}阶段推进',
                 'type': 'project', 'priority': 'normal', 'status': 'doing',
                 'dueDate': '2026-11-25', 'createdAt': '2026-10-10', 'finishedAt': None,
                 'description': f'当前阶段：{pr["stageName"]}，需跟进要素保障',
                 'processLog': None, 'enterpriseId': pr['enterpriseId'], 'projectId': pr['id'],
                 'assignee': 'zhaoshang01', 'source': '项目跟进'}
        else:
            ent = enterprises[(tid * 13) % len(enterprises)]
            t = {'id': tid, 'title': f'【日常巡检】{ent["name"][:16]}季度走访',
                 'type': 'patrol', 'priority': 'low', 'status': 'pending',
                 'dueDate': '2026-12-10', 'createdAt': '2026-10-01', 'finishedAt': None,
                 'description': '季度常规走访，了解经营动态', 'processLog': None,
                 'enterpriseId': ent['id'], 'projectId': None, 'assignee': 'admin', 'source': '日常巡检'}
        tasks.append(t)

    out = {
        '_source': '真实工商数据（Doris opt_company_base / 国家企业信用信息公示系统）+ 规则推导招商指标',
        'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'districts': demo['districts'], 'industries': demo['industries'],
        'enterprises': enterprises, 'riskEvents': events, 'projects': projects,
        'tasks': tasks, 'policies': demo['policies'],
        'judicialCases': judicial_cases,
    }
    json.dump(out, open(OUT_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f'✅ 已生成 {OUT_PATH}')
    print(f'   企业 {len(enterprises)} | 风险 {len(events)} | 项目 {len(projects)} | 任务 {len(tasks)} | 政策 {len(out["policies"])}')
    print(f'   区县: {dict(Counter(e["districtId"] for e in enterprises))}')
    print(f'   行业: {dict(Counter(e["industryId"] for e in enterprises))}')
    ni_hit = sum(1 for e in enterprises if e.get('nationalIndustry'))
    print(f'   官方国标行业覆盖: {ni_hit}/{len(enterprises)}')
    print(f'   国标门类分布: {dict(Counter(e["nationalIndustryL1"] for e in enterprises if e.get("nationalIndustryL1")).most_common(8))}')
    print(f'   风险等级: {dict(Counter(e["riskLevel"] for e in enterprises))}')
    print(f'   规模: {dict(Counter(e["scale"] for e in enterprises))}')
    print(f'   营收合计 {sum(e["revenue"] for e in enterprises)/10000:.1f} 亿 | 纳税 {sum(e["tax"] for e in enterprises)/10000:.2f} 亿')
    print(f'   重点企业 {sum(1 for e in enterprises if e["isKey"])} | 本月新增 {sum(1 for e in enterprises if e["isNew"])}')
    print(f'   信用状态: {dict(Counter(e["creditStatus"] for e in enterprises))}')

    # ★ 硬性校验：所有入库企业必须有真实年报财务（finYear 非空）。
    #   规则推导值不得混入样本——宁可样本变少，也不凑数。
    no_fin = [e for e in enterprises if not e.get('finYear')]
    if no_fin:
        print()
        print(f'❌ 有 {len(no_fin)} 家企业缺少真实年报财务数据（finYear 为空），拒绝生成：')
        for e in no_fin[:10]:
            print(f'     {e["id"]} {e["name"]} revenue={e.get("revenue")}')
        print('   处理：从 enterprises.csv 剔除这些企业，或补齐其年报数据后重试。')
        raise SystemExit(1)
    print(f'   ✅ 财务真实性校验通过：{len(enterprises)}/{len(enterprises)} 家企业均有真实年报财务')

    # ★ 年报「部分公示」审计：营收有值但纳税/资产/净利润未公示的企业，
    #   这些字段记 0（不推导）。此处如实列出家数，供文档口径核对。
    if MISSING_FIELDS:
        print()
        print('   年报部分字段未公示（记 0，未做推导）：')
        for k, label in (('tax', '纳税'), ('asset', '资产总额'), ('profit', '净利润')):
            names = MISSING_FIELDS.get(k) or []
            if names:
                print(f'     {label}: {len(names)} 家 — {"、".join(names[:5])}')
    else:
        print('   ✅ 年报营收/纳税/资产/净利润四项均完整公示，无字段缺失')


if __name__ == '__main__':
    main()
