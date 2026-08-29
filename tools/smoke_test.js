// V4 冒烟测试：加载 index.html，切换每个页面，验证 #content 有内容
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'demo/index.html'), 'utf-8');
const mockJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/data/mock.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/utils.js'), 'utf-8');
const stateJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/state.js'), 'utf-8');
const compJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/components.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/app.js'), 'utf-8');

// 加载 pages 目录
const pagesDir = path.join(__dirname, '..', 'demo/assets/js/pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js'));
const pagesJs = pageFiles.map(f => fs.readFileSync(path.join(pagesDir, f), 'utf-8')).join('\n');

// stub echarts
function makeGradient() {
  return { addColorStop: function() {} };
}
const stubEcharts = {
  init: function () {
    return {
      setOption: function () {},
      dispose: function () {},
      resize: function () {},
      on: function () {}
    };
  },
  registerMap: function () {},
  graphic: {
    LinearGradient: makeGradient,
    RadialGradient: makeGradient
  }
};

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const w = dom.window;
w.echarts = stubEcharts;
w.requestAnimationFrame = cb => setTimeout(cb, 16);
w.console = console;

try {
  w.eval(mockJs);
  console.log('[OK] mock.js 加载成功，企业数:', w.MOCK.ENTERPRISES.length, ' 风险事件:', w.MOCK.RISK_EVENTS.length, ' 政策:', w.MOCK.POLICY_LIB.length);
} catch (e) {
  console.error('[FAIL] mock.js:', e.message);
  process.exit(1);
}

try {
  w.eval('window.APP = {};');
  console.log('  eval utils.js...');
  w.eval(utilsJs);
  console.log('  eval state.js...');
  w.eval(stateJs);
  console.log('  eval components.js...');
  w.eval(compJs);
  pageFiles.forEach(f => {
    const code = fs.readFileSync(path.join(pagesDir, f), 'utf-8');
    console.log('  eval ' + f + '...');
    try {
      w.eval(code);
    } catch (e) {
      console.error('[FAIL] ' + f + ': ' + e.message);
      throw e;
    }
  });
  console.log('  eval app.js...');
  w.eval(appJs);
  console.log('[OK] 所有 JS 模块加载成功');
} catch (e) {
  console.error('[FAIL] JS 加载失败:', e.message);
  console.error(e.stack);
  process.exit(1);
}

// 等一帧
setTimeout(() => {
  const pages = ['dashboard','enterprise','profile','risk','graph','workbench','project','policy','aidemo'];
  let pass = 0, fail = 0;

  pages.forEach(p => {
    try {
      w.APP.state.page = p;
      w.APP.render();
      const content = w.document.querySelector('#content');
      const html = content ? content.innerHTML : '';
      const len = html.replace(/\s/g, '').length;
      if (len > 100) {
        console.log('[OK] 页面 ' + p + ' 渲染成功，内容长度：' + len);
        pass++;
      } else {
        console.error('[FAIL] 页面 ' + p + ' 内容过短：' + len);
        fail++;
      }
    } catch (e) {
      console.error('[FAIL] 页面 ' + p + ' 报错：' + e.message);
      console.error(e.stack);
      fail++;
    }
  });

  console.log('\n===== 测试结果 =====');
  console.log('通过: ' + pass + ' / ' + pages.length);
  console.log('失败: ' + fail);

  if (fail > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 所有页面冒烟测试通过！');
  }
  process.exit(0);
}, 100);
