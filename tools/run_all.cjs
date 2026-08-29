// ============================================================
// 统一测试入口：依次运行全部冒烟 / 校验脚本，汇总结果。
// 任一脚本失败（非零退出码）时整体退出码为 1。
//
// 首步强制执行"引擎一致性前置检查"（sync_engine.py --check）：
// demo 与 web/public/engine 漂移时直接失败——"改了 demo 忘了同步"在这里被拦下。
//
// 用法（推荐走根目录 package.json 入口）：
//   npm test            # 等价于 node tools/run_all.cjs
//   npm run sync        # 前置检查失败时先同步
// jsdom 来自根目录 devDependencies（npm install 后自动解析，无需 NODE_PATH）。
// ============================================================
const { spawnSync } = require('child_process');
const path = require('path');

// ---------- 0. 前置检查：引擎一致性（demo ↔ web/public/engine） ----------
const syncCheck = spawnSync('python', [path.join(__dirname, 'sync_engine.py'), '--check'], {
  encoding: 'utf8',
  timeout: 60000,
});
console.log('===== [前置] 引擎一致性检查（sync_engine.py --check） =====');
console.log(((syncCheck.stdout || '') + (syncCheck.stderr || '')).trim());
if (syncCheck.status !== 0) {
  console.log('\n引擎文件与 demo 存在漂移：先运行 npm run sync（python tools/sync_engine.py）再测试。');
  process.exit(1);
}

// [脚本, 说明, 是否依赖 jsdom]
const SUITE = [
  ['smoke_test.js', '9 页渲染冒烟', true],
  ['smoke_interaction.js', '数据对账 + 下钻链路', true],
  ['check_invariants.js', '风险事件三态不变量', false],
  ['check_data_parity.cjs', 'fixtures 与 demo 口径对账', false],
  ['test_engine_rebuild.cjs', '引擎 rebuild 冒烟', false],
  ['verify_login.cjs', 'demo 登录门禁', true],
  ['verify_industry_responsive.cjs', '驾驶舱环图响应式', true],
  ['verify_profile_responsive.cjs', '画像页响应式', true],
  ['verify_policy_jump.cjs', '画像→政策跳转链路', true],
];

// 需要运行中的 server 的脚本（server 未启动时 SKIP，不计失败）
const SERVER_TESTS = new Set(['verify_web_api.cjs']);

async function serverAlive() {
  try {
    const r = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

(async () => {
  let failed = 0;
  let skipped = 0;
  const serverUp = await serverAlive();

  for (const [file, desc, needsJsdom] of SUITE) {
    const full = path.join(__dirname, file);
    const r = spawnSync(process.execPath, [full], {
      encoding: 'utf8',
      timeout: 120000,
      env: process.env,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const code = r.status;
    const tag = code === 0 ? 'PASS' : 'FAIL';
    console.log(`\n===== [${tag}] ${desc}（${file}） =====`);
    if (out.trim()) console.log(out.trim());
    if (code !== 0) {
      failed++;
      if (code === null && needsJsdom && /Cannot find module 'jsdom'|MODULE_NOT_FOUND/.test(out)) {
        console.log('提示：该脚本依赖 jsdom——请在项目根目录执行 npm install 后重试。');
      }
    }
  }

  // 依赖运行中 server 的接口回归（可选）
  if (serverUp) {
    const file = 'verify_web_api.cjs';
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
      encoding: 'utf8',
      timeout: 180000,
      env: process.env,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    console.log(`\n===== [${r.status === 0 ? 'PASS' : 'FAIL'}] web 接口链路回归（${file}） =====`);
    if (out.trim()) console.log(out.trim());
    if (r.status !== 0) failed++;
  } else {
    skipped++;
    console.log('\n===== [SKIP] web 接口链路回归（verify_web_api.cjs）— server 未运行（cd server && npm run dev） =====');
  }

  console.log('\n========================================');
  if (failed) {
    console.log(`结果：${failed}/${SUITE.length + 1} 个脚本失败${skipped ? `（${skipped} 项跳过）` : ''}`);
    process.exit(1);
  }
  console.log(`结果：全部脚本通过 ✅（${SUITE.length + (serverUp ? 1 : 0)} 跑通${skipped ? `，${skipped} 项跳过` : ''}）`);
})();
