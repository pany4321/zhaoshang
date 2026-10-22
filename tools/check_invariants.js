// 风险事件三态模型不变式校验脚本（一次性验证工具）
// 校验：状态合法、事件↔任务一一对应、数量守恒、时序自洽
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
const w = dom.window;
w.window = w;

// 最小 stub（mock.js 只依赖 Date/Math/JSON 等标准对象）
const code = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/data/mock.js'), 'utf8');
w.eval(code);

// ============================================================
// 字段名与状态值常量 ★ 单一事实源
//
// 这些字面量原先散落在 8 处断言里，mock.js 改名时极易只改一半：
// 剩下的断言取到 undefined，报出的却是「时序错误」「数量不守恒」这类
// 误导性结论，排查成本远高于直接改常量。
// ============================================================
const K = {
  id: 'id',
  status: 'status',
  type: 'type',
  source: 'source',
  time: 'time',
  createTime: 'createTime',
  due: 'due',
  completeTime: 'completeTime',
  daysAgo: 'daysAgo',
};
const EV_STATUS = { PENDING: '待处置', DISPATCHED: '已派发', CLOSED: '已关闭' };
const EV_STATUS_ALL = [EV_STATUS.PENDING, EV_STATUS.DISPATCHED, EV_STATUS.CLOSED];
const TASK_STATUS_DONE = '已完成';
const TASK_TYPE_RISK = '风险处置';

const M = w.MOCK;
const EV = M.RISK_EVENTS;
const riskTasks = M.TASKS.filter(t => t[K.type] === TASK_TYPE_RISK);

let fail = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')); }
}

// 字段自检：常量表里的字段名必须在数据中真实存在。
// 缺了这一步，改名后的断言会取到 undefined 并给出误导性失败原因
// （例如所有任务都归到 source=undefined，看起来像"数据错乱"）。
function verifyKeys(rows, keys, label) {
  let bad = 0;
  for (const k of keys) {
    const miss = rows.filter(r => !r || !(k in r)).length;
    if (miss) {
      bad++;
      console.log(`  ✗ 字段自检：${label} 的 '${k}' 有 ${miss}/${rows.length} 条不存在`);
    }
  }
  return bad;
}

console.log('== 0. 字段表自检 ==');
fail += verifyKeys(EV, [K.id, K.status, K.time, K.daysAgo], 'RISK_EVENTS');
fail += verifyKeys(M.TASKS, [K.id, K.status, K.type, K.source, K.createTime, K.due], 'TASKS');
fail += verifyKeys(riskTasks.filter(t => t[K.status] === TASK_STATUS_DONE), [K.completeTime], 'TASKS(已完成)');
if (!fail) console.log('  ✓ 常量表字段在 mock 数据中均存在');

console.log('== 1. 事件状态合法性 ==');
const VALID = EV_STATUS_ALL;
const badStatus = EV.filter(e => VALID.indexOf(e[K.status]) < 0);
check('全部事件状态 ∈ {' + EV_STATUS_ALL.join(', ') + '}', badStatus.length === 0,
  badStatus.slice(0, 3).map(e => e[K.id] + ':' + e[K.status]).join(', '));
const st = { [EV_STATUS.PENDING]: 0, [EV_STATUS.DISPATCHED]: 0, [EV_STATUS.CLOSED]: 0 };
EV.forEach(e => st[e[K.status]]++);
console.log(`    分布：待处置 ${st[EV_STATUS.PENDING]} / 已派发 ${st[EV_STATUS.DISPATCHED]} / 已关闭 ${st[EV_STATUS.CLOSED]}，共 ${EV.length} 条`);

console.log('== 2. 事件 ↔ 任务 一一对应 ==');
// 每个 source(事件id) 对应的任务数
const bySrc = {};
riskTasks.forEach(t => { const k = t[K.source]; (bySrc[k] = bySrc[k] || []).push(t); });
const dup = Object.keys(bySrc).filter(k => bySrc[k].length > 1);
check('无重复任务（每事件至多 1 条风险处置任务）', dup.length === 0, dup.join(', '));

const needTask = EV.filter(e => e[K.status] !== EV_STATUS.PENDING);
const missing = needTask.filter(e => !bySrc[e[K.id]]);
check('每条非「待处置」事件都有对应任务', missing.length === 0,
  missing.slice(0, 5).map(e => e[K.id]).join(', '));

const orphans = Object.keys(bySrc).filter(k => !EV.some(e => e[K.id] === k));
check('无孤儿任务（任务都指向真实事件）', orphans.length === 0, orphans.join(', '));

console.log('== 3. 数量守恒 ==');
const unfinished = riskTasks.filter(t => t[K.status] !== TASK_STATUS_DONE).length;
const finished = riskTasks.filter(t => t[K.status] === TASK_STATUS_DONE).length;
check(`已派发事件数(${st[EV_STATUS.DISPATCHED]}) ≡ 未完成风险处置任务数(${unfinished})`,
  st[EV_STATUS.DISPATCHED] === unfinished);
check(`已关闭事件数(${st[EV_STATUS.CLOSED]}) ≡ 已完成风险处置任务数(${finished})`,
  st[EV_STATUS.CLOSED] === finished);

console.log('== 4. 状态-任务状态映射一致性 ==');
const wrongMap = [];
needTask.forEach(e => {
  const t = bySrc[e[K.id]] && bySrc[e[K.id]][0];
  if (!t) return;
  if (e[K.status] === EV_STATUS.DISPATCHED && t[K.status] === TASK_STATUS_DONE) {
    wrongMap.push(e[K.id] + '→已完成?!');
  }
  if (e[K.status] === EV_STATUS.CLOSED && t[K.status] !== TASK_STATUS_DONE) {
    wrongMap.push(e[K.id] + '→' + t[K.status] + '?!');
  }
});
check('已派发↔未完成、已关闭↔已完成 映射一致', wrongMap.length === 0, wrongMap.join(', '));

console.log('== 5. 时序自洽（发现 ≤ 创建 ≤ 截止 ≤ 完成）==');
function d(s) {
  // 注意：fmtDate 只产出 'YYYY-MM-DD'（本地日期，无时间部分）。
  // new Date('2026-10-22') 按 ES 规范会被解析成 UTC 午夜 = 北京 08:00，
  // 导致每天 08:00 之前运行时，任何「今天」的创建时间都被误判为未来。
  // 故纯日期串显式按本地时区构造。
  var str = String(s).replace(' ', 'T');
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(str);
}
const seqBad = [];
needTask.forEach(e => {
  const t = bySrc[e[K.id]] && bySrc[e[K.id]][0];
  if (!t) return;
  const disc = d(e[K.time]), cr = d(t[K.createTime]), due = d(t[K.due]);
  const cp = t[K.completeTime] ? d(t[K.completeTime]) : null;
  if (disc > cr) seqBad.push(e[K.id] + ': 创建早于发现');
  if (cp) {
    if (cr > cp) seqBad.push(e[K.id] + ': 完成早于创建');
    if (due > cp) seqBad.push(e[K.id] + ': 截止晚于完成');
  } else if (e[K.daysAgo] >= 0 && cr > new Date()) { seqBad.push(e[K.id] + ': 创建在未来'); }
});
check('全部任务时序正确', seqBad.length === 0, seqBad.slice(0, 6).join('; '));

console.log('== 6. 已完成任务均有完成时间 ==');
const noCt = riskTasks.filter(t => t[K.status] === TASK_STATUS_DONE && !t[K.completeTime]);
check('已完成任务都有 completeTime', noCt.length === 0, noCt.map(t => t[K.id]).join(', '));

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项失败 ❌`);
process.exit(fail === 0 ? 0 : 1);
