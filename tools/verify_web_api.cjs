// ============================================================
// web 版接口链路回归测试（需 server 运行中，默认 http://localhost:3000）
// 覆盖：健康检查 → 未鉴权拦截 → 登录 → bootstrap 与 fixtures 对账
//       → 制造脏数据 → 登录重置接口恢复初始态
//
// 用法：node tools/verify_web_api.cjs [baseUrl]
// 注意：测试过程会重置演示数据库（固定种子，无真实数据）。
// ============================================================
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'server', 'prisma', 'demo-fixtures.json'), 'utf-8'),
);

let fails = 0;
function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`[${ok ? '✅' : '❌'}] ${label}${detail ? ' — ' + detail : ''}`);
}
async function api(pathname, opts = {}, token) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + pathname, Object.assign({}, opts, { headers }));
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

(async () => {
  // 0. 健康检查
  let health;
  try {
    health = await api('/api/health');
  } catch {
    console.log('FAIL: server 不可达（' + BASE + '）。请先启动 server（cd server && npm run dev）。');
    process.exit(1);
  }
  check('健康检查', health.status === 200 && health.body && health.body.ok === true);

  // 1. 未鉴权重置被拦截（401）
  const anon = await api('/api/auth/reset-demo', { method: 'POST', body: '{}' });
  check('未鉴权 reset-demo 返回 401', anon.status === 401, 'status=' + anon.status);

  // 2. 登录
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  check('登录成功', login.status === 200 && !!(login.body.data && login.body.data.token));
  const token = login.body.data && login.body.data.token;

  // 3. bootstrap 与 fixtures 基线对账
  const bs = await api('/api/bootstrap', {}, token);
  const d = (bs.body && bs.body.data) || {};
  check('bootstrap 企业数', (d.enterprises || []).length === fixtures.enterprises.length,
    `server=${(d.enterprises || []).length} fixtures=${fixtures.enterprises.length}`);
  check('bootstrap 风险事件数', (d.riskEvents || []).length === fixtures.riskEvents.length,
    `server=${(d.riskEvents || []).length} fixtures=${fixtures.riskEvents.length}`);
  check('bootstrap 任务数', (d.tasks || []).length === fixtures.tasks.length,
    `server=${(d.tasks || []).length} fixtures=${fixtures.tasks.length}`);
  check('bootstrap 政策数', (d.policies || []).length === fixtures.policies.length,
    `server=${(d.policies || []).length} fixtures=${fixtures.policies.length}`);
  check('bootstrap 项目数', (d.projects || []).length === fixtures.projects.length,
    `server=${(d.projects || []).length} fixtures=${fixtures.projects.length}`);

  // 4. 制造脏数据
  const mk = await api('/api/workbench/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'DIRTY-VERIFY-WEB-API', type: 'service', priority: 'normal', dueDate: '2026-09-15', assignee: 'admin' }),
  }, token);
  check('创建脏任务', mk.status === 200);
  const bs2 = await api('/api/bootstrap', {}, token);
  const dirty = (bs2.body.data.tasks || []).filter(t => (t.title || '').indexOf('DIRTY-VERIFY-WEB-API') >= 0);
  check('脏任务已出现', dirty.length === 1, `count=${dirty.length}`);

  // 5. 登录重置接口恢复初始态
  const reset = await api('/api/auth/reset-demo', { method: 'POST', body: '{}' }, token);
  check('reset-demo 成功', reset.status === 200 && reset.body.code === 0, `status=${reset.status}`);
  const bs3 = await api('/api/bootstrap', {}, token);
  const tasksAfter = bs3.body.data.tasks || [];
  check('重置后任务数回到基线', tasksAfter.length === fixtures.tasks.length,
    `server=${tasksAfter.length} baseline=${fixtures.tasks.length}`);
  check('重置后脏数据清除', !tasksAfter.some(t => (t.title || '').indexOf('DIRTY-VERIFY-WEB-API') >= 0));

  // 6. 风险权重配置：默认 8 维 → 非法权重拦截 → 合法权重落库 → bootstrap 下发 → 恢复默认
  const gw0 = await api('/api/config/risk-weights');
  check('读取默认风险权重 8 维', gw0.status === 200 && Array.isArray(gw0.body.data) && gw0.body.data.length === 8,
    `status=${gw0.status}`);
  const badPut = await api('/api/config/risk-weights', {
    method: 'PUT',
    body: JSON.stringify([{ key: 'op', weight: 0.5 }]),
  }, token);
  check('非法权重（非 8 维）被 400 拦截', badPut.status === 400, `status=${badPut.status}`);
  const badSum = await api('/api/config/risk-weights', {
    method: 'PUT',
    body: JSON.stringify([
      { key: 'operation', name: '经营风险', weight: 0.4 },
      { key: 'finance', name: '财务风险', weight: 0.2 },
      { key: 'judicial', name: '司法风险', weight: 0.1 },
      { key: 'credit', name: '信用风险', weight: 0.1 },
      { key: 'tender', name: '招投标风险', weight: 0.05 },
      { key: 'tax', name: '税务风险', weight: 0.05 },
      { key: 'perform', name: '招商履约风险', weight: 0.05 },
      { key: 'ip', name: '知识产权风险', weight: 0.0 },
    ]),
  }, token);
  check('权重总和非 100%（合计 95%）被 400 拦截', badSum.status === 400, `status=${badSum.status}`);
  const performWeights = [
    { key: 'operation', name: '经营风险', weight: 0.10 },
    { key: 'finance', name: '财务风险', weight: 0.10 },
    { key: 'judicial', name: '司法风险', weight: 0.10 },
    { key: 'credit', name: '信用风险', weight: 0.10 },
    { key: 'tender', name: '招投标风险', weight: 0.05 },
    { key: 'tax', name: '税务风险', weight: 0.10 },
    { key: 'perform', name: '招商履约风险', weight: 0.40 },
    { key: 'ip', name: '知识产权风险', weight: 0.05 },
  ];
  const okPut = await api('/api/config/risk-weights', {
    method: 'PUT',
    body: JSON.stringify(performWeights),
  }, token);
  check('合法权重落库成功', okPut.status === 200 && okPut.body.code === 0, `status=${okPut.status}`);
  const gw1 = await api('/api/config/risk-weights');
  const performDim = (gw1.body.data || []).find(w => w.key === 'perform');
  check('落库后读取到履约权重 40%', !!performDim && performDim.weight === 0.4,
    `perform=${performDim ? performDim.weight : 'missing'}`);
  const bs4 = await api('/api/bootstrap', {}, token);
  const sentW = (bs4.body.data || {}).riskWeights;
  check('bootstrap 下发自定义权重', Array.isArray(sentW) && sentW.length === 8,
    `riskWeights=${Array.isArray(sentW) ? sentW.length : sentW}`);
  // 恢复默认权重，避免污染后续演示数据
  const defaultWeights = [
    { key: 'operation', name: '经营风险', weight: 0.20 },
    { key: 'finance', name: '财务风险', weight: 0.15 },
    { key: 'judicial', name: '司法风险', weight: 0.15 },
    { key: 'credit', name: '信用风险', weight: 0.15 },
    { key: 'tender', name: '招投标风险', weight: 0.10 },
    { key: 'tax', name: '税务风险', weight: 0.10 },
    { key: 'perform', name: '招商履约风险', weight: 0.10 },
    { key: 'ip', name: '知识产权风险', weight: 0.05 },
  ];
  await api('/api/config/risk-weights', { method: 'PUT', body: JSON.stringify(defaultWeights) }, token);

  console.log('\n========================================');
  if (fails) {
    console.log(`结果：${fails} 项失败`);
    process.exit(1);
  }
  console.log('结果：接口链路回归全部通过 ✅');
})().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
