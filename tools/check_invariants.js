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

const M = w.MOCK;
const EV = M.RISK_EVENTS;
const riskTasks = M.TASKS.filter(t => t.type === '风险处置');

let fail = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')); }
}

console.log('== 1. 事件状态合法性 ==');
const VALID = ['待处置', '已派发', '已关闭'];
const badStatus = EV.filter(e => VALID.indexOf(e.status) < 0);
check('全部事件状态 ∈ {待处置, 已派发, 已关闭}', badStatus.length === 0,
  badStatus.slice(0, 3).map(e => e.id + ':' + e.status).join(', '));
const st = { 待处置: 0, 已派发: 0, 已关闭: 0 };
EV.forEach(e => st[e.status]++);
console.log(`    分布：待处置 ${st['待处置']} / 已派发 ${st['已派发']} / 已关闭 ${st['已关闭']}，共 ${EV.length} 条`);

console.log('== 2. 事件 ↔ 任务 一一对应 ==');
// 每个 source(事件id) 对应的任务数
const bySrc = {};
riskTasks.forEach(t => { const k = t.source; (bySrc[k] = bySrc[k] || []).push(t); });
const dup = Object.keys(bySrc).filter(k => bySrc[k].length > 1);
check('无重复任务（每事件至多 1 条风险处置任务）', dup.length === 0, dup.join(', '));

const needTask = EV.filter(e => e.status !== '待处置');
const missing = needTask.filter(e => !bySrc[e.id]);
check('每条非「待处置」事件都有对应任务', missing.length === 0,
  missing.slice(0, 5).map(e => e.id).join(', '));

const orphans = Object.keys(bySrc).filter(k => !EV.some(e => e.id === k));
check('无孤儿任务（任务都指向真实事件）', orphans.length === 0, orphans.join(', '));

console.log('== 3. 数量守恒 ==');
const unfinished = riskTasks.filter(t => t.status !== '已完成').length;
const finished = riskTasks.filter(t => t.status === '已完成').length;
check(`已派发事件数(${st['已派发']}) ≡ 未完成风险处置任务数(${unfinished})`, st['已派发'] === unfinished);
check(`已关闭事件数(${st['已关闭']}) ≡ 已完成风险处置任务数(${finished})`, st['已关闭'] === finished);

console.log('== 4. 状态-任务状态映射一致性 ==');
const wrongMap = [];
needTask.forEach(e => {
  const t = bySrc[e.id] && bySrc[e.id][0];
  if (!t) return;
  if (e.status === '已派发' && t.status === '已完成') wrongMap.push(e.id + '→已完成?!');
  if (e.status === '已关闭' && t.status !== '已完成') wrongMap.push(e.id + '→' + t.status + '?!');
});
check('已派发↔未完成、已关闭↔已完成 映射一致', wrongMap.length === 0, wrongMap.join(', '));

console.log('== 5. 时序自洽（发现 ≤ 创建 ≤ 截止 ≤ 完成）==');
function d(s) { return new Date(String(s).replace(' ', 'T')); }
const seqBad = [];
needTask.forEach(e => {
  const t = bySrc[e.id] && bySrc[e.id][0];
  if (!t) return;
  const disc = d(e.time), cr = d(t.createTime), due = d(t.due);
  const cp = t.completeTime ? d(t.completeTime) : null;
  if (disc > cr) seqBad.push(e.id + ': 创建早于发现');
  if (cp) {
    if (cr > cp) seqBad.push(e.id + ': 完成早于创建');
    if (due > cp) seqBad.push(e.id + ': 截止晚于完成');
  } else if (e.daysAgo >= 0 && cr > new Date()) { seqBad.push(e.id + ': 创建在未来'); }
});
check('全部任务时序正确', seqBad.length === 0, seqBad.slice(0, 6).join('; '));

console.log('== 6. 已完成任务均有完成时间 ==');
const noCt = riskTasks.filter(t => t.status === '已完成' && !t.completeTime);
check('已完成任务都有 completeTime', noCt.length === 0, noCt.map(t => t.id).join(', '));

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项失败 ❌`);
process.exit(fail === 0 ? 0 : 1);
