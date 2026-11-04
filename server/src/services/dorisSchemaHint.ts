/* ============================================================
 * 数据仓库核心表速查（注入 system prompt，压缩工具探索轮次 + 规避 SQL 报错）
 *
 * 为什么需要它：
 *   1. 改造前 insight 智能体回答一次要 5 轮工具调用、实测 29.4 秒，前两轮几乎全是
 *      doris_list_tables + doris_table_schema —— 纯粹为了让模型知道表和字段叫什么；
 *   2. 更致命的是 annual_report_asset 的金额字段**全是 varchar**
 *      （形如 "1234.5万元" 或 "不公示"），模型按数值直接 SUM/比较会报
 *      Error 1105，然后整轮作废重来。这两类信息放进 prompt 才是真正的提速。
 *
 * 维护约定：
 *   1. 字段名必须来自 get_table_detail 实测，不要凭业务文档猜物理列名；
 *   2. 速查表覆盖不到的表，模型仍可调 doris_list_tables / doris_table_schema；
 *   3. 增删表时同步更新 docs/数据口径说明.md。
 * ============================================================ */

/** 年报金额字段是 varchar，聚合前必须清洗成 DECIMAL —— 直接给模型可抄的表达式 */
export const AMOUNT_CLEAN = `CAST(NULLIF(REGEXP_REPLACE(business_income,'[^0-9.]',''),'') AS DECIMAL(20,2))`

export const DORIS_SCHEMA_HINT = [
  '【数据仓库核心表速查】（daas 库，SQL 里直接写裸表名；所有表都要带 use_flag = 0）',
  '',
  'opt_company_base — 工商照面，一行一个主体',
  '  company_id       主体唯一键（所有表都靠它关联）',
  '  company_name / credit_no / legal_person',
  '  establish_date   成立日期（date 类型）',
  '  capital_num      注册资本数值（decimal，单位万元，可直接比较/聚合）；capital 是文本别用',
  '  n_company_status 归类后的登记状态（正常/注销/吊销…，分组统计用这个）',
  '  company_major_type 主体类型码（3=工商企业，1=个体户）',
  '  province / city / district 省/市/区县',
  '',
  'annual_report_asset — 年报资产，一行=企业一年',
  '  ⚠ 金额字段全部是 varchar 文本（可能是 "1234.5万元" 或 "不公示"），',
  '    直接 SUM/比较会报错，必须先清洗。可照抄这个写法：',
  `    ${AMOUNT_CLEAN}`,
  '  字段：company_id / report_year / business_income 销售总额 / tax_amount 纳税总额 /',
  '        profit_amount 净利润 / total_amount 资产总额 / debt_amount 负债总额 /',
  '        equity_amount 所有者权益 / financial_loan 金融贷款',
  '  取最新一年：WHERE report_year = (SELECT MAX(report_year) FROM annual_report_asset)',
  '',
  'annual_report_base — 年报从业人数：company_id / employee_no（部分企业填"不公示"）',
  '',
  'company_industry — 官方行业分类（一行一主体，四级；opt_company_base 本身没有行业字段，',
  '  按行业统计必须 JOIN 这张表，否则会报"字段不存在"）',
  '  company_id / industry（最细行业名）',
  '  industry_l1_name 一级门类（制造业/批发和零售业/建筑业/农、林、牧、渔业…）',
  '  industry_l2_name 二级 / industry_l3_name 三级 / industry_l4_name 四级',
  '  标准写法（庆阳市制造业按区县分布，可直接套用）：',
  '    SELECT b.district, COUNT(DISTINCT b.company_id) AS n',
  '    FROM opt_company_base b JOIN company_industry i ON b.company_id = i.company_id',
  "    WHERE b.use_flag = 0 AND i.use_flag = 0 AND b.province = '甘肃省' AND b.city = '庆阳市'",
  "      AND b.n_company_status = '正常' AND i.industry_l1_name = '制造业'",
  '    GROUP BY b.district ORDER BY n DESC',
  '',
  '区划口径：city 写全称 "庆阳市"，district 为西峰区/庆城县/环县/华池县/合水县/正宁县/宁县/镇原县；',
  '  province 写 "甘肃省"。不要简写成 "庆阳"。',
  '',
  '常用关联表（均以 company_id 关联；个别列名不确定时用 SELECT * FROM 表 LIMIT 1 一次探明）',
  '  opt_ent_partner_std          股东与持股比例',
  '  opt_judicial_case            司法案件',
  '  risk_zhixing                 被执行',
  '  risk_shixin                  失信被执行',
  '  company_bid_entity_list_new  招投标',
  '  company_punish               行政处罚',
  '  company_abnormal             经营异常',
  '  company_pledge               股权出质',
  '  company_chattel_mortgage     动产抵押',
  '  ip_patent / ip_trademark     专利 / 商标',
  '',
  '【取数效率规则（重要，直接影响响应速度）】',
  '1. 平台自身已接入庆阳 88 家企业（工商、年报财务、司法、招投标、知识产权、风险事件）。',
  '   凡这 88 家范围内的问题（企业名单、区县分布、风险等级分布、单个企业详情、营收排名、',
  '   政策匹配、项目推荐），只用本地工具 query_enterprises / get_enterprise_detail，',
  '   或直接用上方【平台数据概览】回答，**不要调用 doris_query**——查仓库更慢且要多花一轮；',
  '2. 只有明确超出这 88 家的问题（全市全量企业统计、历史年报明细、招投标/司法/处罚明细、',
  '   跨表关联穿透）才用 doris_query；',
  '3. 上表已列出的表和字段直接用，不要为了"确认"再调 doris_table_schema；',
  '   想知道某表有哪些列时，用 SELECT * FROM 表名 LIMIT 1 探一次即可；',
  '4. 连表名都不确定时才调 doris_list_tables；',
  '5. 一次能问清的统计合并成一条 SQL（GROUP BY / CASE WHEN），不要拆成多条；',
  '6. 整轮最多 3 次工具调用，第 2 次拿到数据后必须开始写结论，不要再查。',
].join('\n')
