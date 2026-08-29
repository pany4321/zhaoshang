/* ============================================================
 * 页面：AI 智能体
 * 四个智能体：企业洞察、风险研判、招商谋划、企业服务
 * 每个独立对话上下文，预脚本回答（确定性演示）
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;

  // 智能体图标：白色线性 SVG + 专属渐变底色（替代 emoji，视觉更精致统一）
  function svgIcon(paths) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICON_INSIGHT = svgIcon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M7.6 11.6l1.8-2 1.7 2.1 2.4-3.1"/>');
  var ICON_RISK = svgIcon('<path d="M12 3l7 2.8v5.4c0 4.5-3 8.2-7 9.8-4-1.6-7-5.3-7-9.8V5.8L12 3z"/><path d="M12 8v4.2"/><circle cx="12" cy="15.6" r="0.5" fill="#fff" stroke="none"/>');
  var ICON_PLAN = svgIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.1" fill="#fff" stroke="none"/><path d="M12 4V2.4M12 22v-1.6M4 12H2.4M22 12h-1.6" stroke-width="1.4"/>');
  var ICON_SERVICE = svgIcon('<path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13"/><rect x="3.4" y="12.4" width="3.8" height="5.8" rx="1.7"/><rect x="16.8" y="12.4" width="3.8" height="5.8" rx="1.7"/><path d="M19 18.4v.7a2.6 2.6 0 0 1-2.6 2.6h-2.9"/>');
  var agents = [
    { key: 'insight', name: '企业洞察智能体', icon: ICON_INSIGHT,
      grad: 'linear-gradient(135deg,#0EA5E9,#2563EB)',
      desc: '基于多源数据深度分析企业经营状态、发展潜力与风险特征，生成综合研判报告。' },
    { key: 'risk', name: '风险研判智能体', icon: ICON_RISK,
      grad: 'linear-gradient(135deg,#F97316,#EF4444)',
      desc: '主动扫描企业经营异常信号，识别潜在风险并给出处置建议与影响评估。' },
    { key: 'plan', name: '招商谋划智能体', icon: ICON_PLAN,
      grad: 'linear-gradient(135deg,#8B5CF6,#6366F1)',
      desc: '基于产业链分析与区域定位，智能推荐招商方向、目标企业与落地路径。' },
    { key: 'service', name: '企业服务智能体', icon: ICON_SERVICE,
      grad: 'linear-gradient(135deg,#10B981,#0EA5E9)',
      desc: '7×24 小时政策咨询、办事指引、诉求响应，提供一站式精准服务。' }
  ];

  var currentAgent = 'insight';
  // 每个智能体独立对话历史
  var conversations = {
    insight: [
      { role: 'assistant', type: 'text', content: '您好，我是企业洞察智能体。我可以为您分析企业的经营状况、发展潜力、行业地位等。请输入您想了解的企业名称，或直接提问。' }
    ],
    risk: [
      { role: 'assistant', type: 'text', content: '您好，我是风险研判智能体。我可以主动识别企业经营、财务、司法、信用等多维度风险，并提供处置建议。请问您想了解哪家企业的风险情况？' }
    ],
    plan: [
      { role: 'assistant', type: 'text', content: '您好，我是招商谋划智能体。我可以基于庆阳市产业基础和发展规划，为您推荐重点招商方向、目标企业和落地路径。请问您关注哪个产业方向？' }
    ],
    service: [
      { role: 'assistant', type: 'text', content: '您好，我是企业服务智能体。我可以为您提供政策咨询、办事指引、诉求响应等服务。请问有什么可以帮您？' }
    ]
  };

  function renderAiDemo() {
    var agentHtml = agents.map(function(a){
      return '<div class="agent-card ' + (currentAgent===a.key?'active':'') + '" data-agent="'+a.key+'">' +
        '<div class="ac-icon" style="background:' + a.grad + ';box-shadow:0 4px 10px rgba(37,99,235,.22);">' + a.icon + '</div>' +
        '<div class="ac-body">' +
          '<div class="ac-name">' + a.name + '</div>' +
          '<div class="ac-desc">' + a.desc + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var msgs = conversations[currentAgent] || [];
    var msgsHtml = msgs.map(msgToHtml).join('');

    var agent = agents.filter(function(a){return a.key===currentAgent;})[0] || agents[0];

    // 快捷问题
    var quickQuestions = getQuickQuestions(currentAgent);
    var quickHtml = quickQuestions.map(function(q){
      return '<span class="quick-q" data-q="'+U.esc(q)+'">' + U.esc(q) + '</span>';
    }).join('');

    U.$('#content').innerHTML =
      '<div class="ai-wrap">' +
        // 左侧智能体选择
        '<div class="ai-side card">' +
          '<div class="card-title matrix-title">'
          + '<span class="ct-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.6l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2 2-5.4z"/><circle cx="19.2" cy="18.8" r="2.2"/></svg></span>'
          + 'AI 智能体矩阵</div>' +
          '<div class="agent-list">' + agentHtml + '</div>' +
        '</div>' +
        // 右侧对话
        '<div class="ai-main card">' +
          '<div class="ai-chat-header">' +
            '<div class="ach-left">' +
              '<div class="ach-icon" style="background:' + agent.grad + ';">' + agent.icon + '</div>' +
              '<div>' +
                '<div class="ach-name">' + agent.name + '</div>' +
                '<div class="ach-status"><span class="status-dot"></span>在线 · 响应中</div>' +
              '</div>' +
            '</div>' +
            '<div class="ach-right">' +
              '<button class="btn sm" id="clearChat">清空对话</button>' +
            '</div>' +
          '</div>' +
          '<div class="ai-messages" id="aiMessages">' + msgsHtml + '</div>' +
          '<div class="ai-quick">' + quickHtml + '</div>' +
          '<div class="ai-input">' +
            '<textarea id="aiInput" placeholder="请输入您的问题，回车发送（Shift+Enter 换行）..." rows="2"></textarea>' +
            '<button class="btn primary" id="aiSend">发送</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // 事件
    U.$$('.agent-card').forEach(function(c){
      c.addEventListener('click', function(){
        currentAgent = c.dataset.agent;
        renderAiDemo();
      });
    });
    U.$('#clearChat').addEventListener('click', function(){
      var agent = agents.filter(function(a){return a.key===currentAgent;})[0];
      conversations[currentAgent] = [
        { role: 'assistant', type: 'text', content: '对话已清空。' + (agent ? agent.name : '') + '为您服务，请提问。' }
      ];
      renderAiDemo();
    });
    U.$('#aiSend').addEventListener('click', sendMessage);
    var ta = U.$('#aiInput');
    ta.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    U.$$('.quick-q').forEach(function(q){
      q.addEventListener('click', function(){
        U.$('#aiInput').value = q.dataset.q;
        sendMessage();
      });
    });

    // 滚动到底部
    var msgBox = U.$('#aiMessages');
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
  }

  function getQuickQuestions(key) {
    switch(key) {
      case 'insight':
        return ['分析一下甘肃XX能源科技有限公司', '庆阳市营收前5的企业有哪些？', '新能源行业发展趋势如何'];
      case 'risk':
        return ['当前有哪些重大风险企业？', '分析XX公司的主要风险点', '近30天新增了哪些风险事件'];
      case 'plan':
        return ['庆阳市重点招商方向是什么？', '推荐新能源产业链目标企业', '如何引进数字经济头部企业'];
      case 'service':
        return ['高新技术企业认定条件是什么？', '稳岗补贴怎么申请？', '企业诉求如何提交'];
      default:
        return ['请介绍一下平台功能'];
    }
  }

  var ICON_USER = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="8" r="4"/><path d="M4 20.5C4 16.4 7.6 13.8 12 13.8C16.4 13.8 20 16.4 20 20.5V21H4V20.5Z"/></svg>';
  function fmtHm(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var pf = function (x) { return x < 10 ? '0' + x : '' + x; };
    return pf(d.getHours()) + ':' + pf(d.getMinutes());
  }
  function msgToHtml(msg) {
    var isUser = msg.role === 'user';
    var agent = agents.filter(function(a){return a.key===currentAgent;})[0] || agents[0];
    var miniIcon = agent.icon.replace('width="20" height="20"', 'width="15" height="15"');
    var avatar = isUser
      ? ICON_USER
      : '<span style="display:inline-flex;width:24px;height:24px;border-radius:8px;background:' + agent.grad + ';align-items:center;justify-content:center;">' + miniIcon + '</span>';
    var name = isUser ? '您' : agent.name;
    var time = fmtHm(msg.ts);
    var contentHtml = msg.type === 'thinking'
      ? '<div class="msg-thinking"><span class="t-dot"></span><span class="t-dot"></span><span class="t-dot"></span></div>'
      : '<div class="msg-text">' + U.esc(msg.content).replace(/\n/g, '<br/>') + '</div>';
    return '<div class="msg ' + (isUser ? 'msg-user' : 'msg-ai') + '">' +
      '<div class="msg-avatar' + (isUser ? ' user' : '') + '" style="' + (isUser ? '' : 'background:' + agent.grad + ';') + '">' + avatar + '</div>' +
      '<div class="msg-body">' +
        '<div class="msg-name" style="display:flex;align-items:baseline;gap:8px;"><span>' + name + '</span>' +
          (time ? '<span style="font-size:10px;color:#CBD5E1;font-weight:400;">' + time + '</span>' : '') + '</div>' +
        contentHtml +
      '</div>' +
    '</div>';
  }

  var generating = false; // 流式输出期间禁止重复发送
  function setGeneratingUi(on) {
    var btn = U.$('#aiSend');
    var ta = U.$('#aiInput');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? '生成中…' : '发送';
      btn.style.opacity = on ? '0.6' : '';
      btn.style.cursor = on ? 'default' : '';
    }
    if (ta) ta.placeholder = on
      ? '智能体正在回复，请稍候…'
      : '请输入您的问题，回车发送（Shift+Enter 换行）...';
  }

  function sendMessage() {
    if (generating) return;
    var input = U.$('#aiInput');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';

    var conv = conversations[currentAgent];
    conv.push({ role: 'user', type: 'text', content: text, ts: Date.now() });

    // 思考中提示（随机时长，更接近真实推理节奏）
    var thinkingId = 'think_' + Date.now();
    conv.push({ role: 'assistant', type: 'thinking', id: thinkingId });
    generating = true;
    setGeneratingUi(true);
    refreshMessages();

    var thinkMs = 900 + Math.round(Math.random() * 900);
    setTimeout(function(){
      conv = conversations[currentAgent];
      for (var i = conv.length - 1; i >= 0; i--) {
        if (conv[i].id === thinkingId) { conv.splice(i, 1); break; }
      }
      // 生成回答 → 打字机流式输出（异常时给出兜底回复，不再卡死发送状态）
      var reply;
      try {
        reply = generateReply(currentAgent, text);
      } catch (err) {
        console.error('[aidemo] 回复生成异常', err);
        reply = '您的问题我已记录，但处理过程中遇到异常，请换个问法或稍后再试。';
      }
      var msg = { role: 'assistant', type: 'text', content: '', ts: Date.now() };
      conv.push(msg);
      typeOut(msg, reply);
    }, thinkMs);
  }

  // 打字机流式输出：按随机块长推进，完成后恢复输入并持久化会话
  // 流式输出期间仅更新最后一条 AI 消息的文本节点：
  // 整区重建 innerHTML 会引起整块重排与滚动条跳动（对话框抖动），必须避免
  function paintStreaming(msg) {
    var box = U.$('#aiMessages');
    if (!box) return;
    var conv = conversations[currentAgent];
    var idx = -1;
    for (var i = 0; i < conv.length; i++) { if (conv[i] === msg) { idx = i; break; } }
    var nodes = box.querySelectorAll('.msg');
    var node = idx >= 0 ? nodes[idx] : null;
    var txt = node ? node.querySelector('.msg-text') : null;
    if (!txt) { refreshMessages(); return; }
    txt.innerHTML = U.esc(msg.content).replace(/\n/g, '<br/>');
    // 仅当用户本来就在底部附近时才跟随滚动，避免打断回看
    var nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  // 打字机流式输出：较大块长 + 较低频率，减少重排次数；完成后恢复输入并持久化会话
  function typeOut(msg, full) {
    var pos = 0;
    var total = full.length;
    var base = Math.max(2, Math.ceil(total / 70));
    function step() {
      pos = Math.min(total, pos + base + Math.floor(Math.random() * 5));
      msg.content = full.slice(0, pos);
      paintStreaming(msg);
      if (pos < total) {
        setTimeout(step, 26 + Math.round(Math.random() * 42));
      } else {
        refreshMessages();
        generating = false;
        setGeneratingUi(false);
      }
    }
    setTimeout(step, 120);
  }

  function refreshMessages() {
    var msgBox = U.$('#aiMessages');
    if (!msgBox) return;
    var conv = conversations[currentAgent];
    msgBox.innerHTML = conv.map(msgToHtml).join('');
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  function generateReply(agentKey, question) {
    var ent = findEnterpriseInText(question);
    var topEnts = M.ENTERPRISES.slice().sort(function(a,b){return b.overview.revenueWan-a.overview.revenueWan;}).slice(0,5);
    var redEnts = M.ENTERPRISES.filter(function(e){return e.riskLevel==='red';});

    // 新能源行业统计：兼容本地(newEnergy)与服务器(neequip)行业键，兜底汇总
    var neInd = null;
    M.INDUSTRIES.forEach(function(i){ if (i.key === 'newEnergy' || i.key === 'neequip') neInd = i; });
    if (!neInd) neInd = { count: 0, revenue: 0 };

    switch(agentKey) {
      case 'insight':
        if (ent) {
          return '【' + ent.name + ' 企业洞察报告】\n\n' +
            '📊 基本概况\n' +
            '该企业成立于' + ent.found + '，注册资本' + ent.overview.regCapital + '，位于' + ent.districtName + '，属于' + ent.industryName + '行业。现有员工' + ent.overview.employees + '人。\n\n' +
            '💰 经营业绩\n' +
            '年营收' + ent.overview.revenue + '，年纳税' + ent.overview.tax + '，固定资产投资' + ent.overview.invest + '。近6个月营收呈' + (ent.operation.revenue[5] > ent.operation.revenue[0] ? '上升' : '下降') + '趋势。\n\n' +
            '⚠️ 风险评估\n' +
            '综合风险指数 ' + ent.riskScore + ' 分（' + M.LEVELS[ent.riskLevel].name + '）。主要风险维度：' + topRiskDims(ent) + '。\n\n' +
            '🎯 综合评价\n' +
            (ent.riskLevel === 'red' ? '该企业当前风险较高，建议重点关注，加强日常监测与预警。' :
             ent.riskLevel === 'orange' ? '该企业存在一定风险隐患，建议持续跟踪经营变化，及时做好风险处置。' :
             '该企业经营状况总体良好，建议继续保持良性互动，推动企业做优做强。') + '\n\n' +
            '如需更详细的分析，请继续提问。';
        }
        if (question.indexOf('前5') >= 0 || question.indexOf('TOP5') >= 0 || question.indexOf('营收') >= 0) {
          return '庆阳市营收 TOP5 企业：\n\n' +
            topEnts.map(function(e,i){ return (i+1) + '. ' + e.name + '（' + e.overview.revenue + '）'; }).join('\n') +
            '\n\n以上企业涵盖' + topEnts[0].industryName + '、' + topEnts[1].industryName + '等重点产业，是庆阳市工业经济的核心支撑力量。';
        }
        if (question.indexOf('新能源') >= 0 || question.indexOf('趋势') >= 0) {
          return '【庆阳市新能源产业发展态势分析】\n\n' +
            '1️⃣ 产业规模：全市新能源装备制造相关企业' + neInd.count + '家，年度营收' + neInd.revenue + '亿元。\n\n' +
            '2️⃣ 发展优势：庆阳市风光资源富集，是国家重要的新能源基地。风电、光伏装机容量持续增长，储能、氢能等新兴业态加速布局。\n\n' +
            '3️⃣ 重点企业：甘肃XX能源科技有限公司、庆阳XX新能源有限公司等骨干企业带动效应明显。\n\n' +
            '4️⃣ 发展建议：围绕"源网荷储"一体化，延链补链强链，打造千亿级新能源产业集群。\n\n' +
            '如需了解具体企业详情，请告诉我企业名称。';
        }
        return '好的，我可以为您分析企业情况。您可以：\n\n' +
          '• 输入企业名称，获取深度洞察报告\n' +
          '• 询问行业发展趋势\n' +
          '• 了解 TOP 企业排名\n' +
          '• 对比多家企业经营状况\n\n' +
          '请问您想了解什么？';

      case 'risk':
        if (question.indexOf('重大风险') >= 0 || question.indexOf('red') >= 0 || question.indexOf('哪些') >= 0) {
          return '【重大风险企业清单】\n\n' +
            '当前全市重大风险（红色）企业共 ' + redEnts.length + ' 家：\n\n' +
            redEnts.map(function(e,i){
              return (i+1) + '. ' + e.name + '\n   风险指数：' + e.riskScore + ' 分\n   主要风险：' + topRiskDims(e);
            }).join('\n\n') +
            '\n\n⚠️ 建议：对以上企业加强高频监测，制定"一企一策"风险处置方案，定期开展风险会商。\n\n' +
            '如需查看某家企业的详细风险分析，请告诉我企业名称。';
        }
        if (ent) {
          return '【' + ent.name + ' 风险研判报告】\n\n' +
            '🎯 综合风险等级：' + M.LEVELS[ent.riskLevel].name + '（' + ent.riskScore + ' 分）\n\n' +
            '📊 九维风险分析：\n' +
            M.RISK_DIMS.filter(function(d){return d.weight>0;}).map(function(d){
              var v = ent.risks[d.key]||0;
              var lv = v >= 65 ? '🔴' : v >= 45 ? '🟠' : v >= 25 ? '🟡' : '🔵';
              return '  ' + lv + ' ' + d.name + '：' + v + ' 分（权重' + Math.round(d.weight*100) + '%）';
            }).join('\n') + '\n\n' +
            '⚠️ 主要风险点：\n' + topRiskList(ent) + '\n\n' +
            '💡 处置建议：\n' +
            '1. 建立企业风险监测台账，实施周监测、月研判\n' +
            '2. 约谈企业负责人，了解经营困难，研究帮扶措施\n' +
            '3. 协调相关部门，提前做好风险应对预案\n' +
            '4. 引导企业转型升级，提升抗风险能力\n\n' +
            '如需更深入的风险溯源分析，请继续提问。';
        }
        if (question.indexOf('新增') >= 0 || question.indexOf('近30天') >= 0 || question.indexOf('30天') >= 0) {
          var newRisks = M.RISK_EVENTS.filter(function(e){ return e.daysAgo <= 30; });
          return '【近 30 天风险事件统计】\n\n' +
            '新增风险事件：' + newRisks.length + ' 件\n' +
            '其中重大风险：' + newRisks.filter(function(e){return e.level==='red';}).length + ' 件\n' +
            '较高风险：' + newRisks.filter(function(e){return e.level==='orange';}).length + ' 件\n\n' +
            '主要风险类型分布：\n' +
            '• 经营风险：' + Math.round(newRisks.length*0.3) + ' 件\n' +
            '• 财务风险：' + Math.round(newRisks.length*0.25) + ' 件\n' +
            '• 司法风险：' + Math.round(newRisks.length*0.15) + ' 件\n' +
            '• 信用风险：' + Math.round(newRisks.length*0.15) + ' 件\n' +
            '• 其他：' + Math.round(newRisks.length*0.15) + ' 件\n\n' +
            '建议重点关注新增重大风险，及时开展处置工作。';
        }
        return '我可以为您提供风险分析服务。您可以：\n\n' +
          '• 询问当前重大风险企业清单\n' +
          '• 分析某家企业的风险详情\n' +
          '• 了解近期新增风险事件\n' +
          '• 获取风险处置建议\n\n' +
          '请问您想了解哪方面的风险情况？';

      case 'plan':
        if (question.indexOf('招商方向') >= 0 || question.indexOf('重点') >= 0) {
          return '【庆阳市重点招商方向】\n\n' +
            '基于庆阳市资源禀赋、产业基础和发展规划，重点推进以下招商方向：\n\n' +
            '1️⃣ 新能源及装备制造\n   依托风光资源优势，招引风电、光伏、储能、氢能及配套装备制造企业，打造千亿级新能源产业集群。\n\n' +
            '2️⃣ 石油化工及新材料\n   发挥长庆油田资源优势，延伸石化产业链，招引精细化工、化工新材料项目。\n\n' +
            '3️⃣ 数字经济\n   抢抓"东数西算"机遇，招引数据中心、云计算、人工智能、信创产业项目。\n\n' +
            '4️⃣ 中医药及健康养老\n   依托"中国药都"品牌，招引中医药加工、生物制药、康养旅游项目。\n\n' +
            '5️⃣ 现代农业及食品加工\n   围绕特色农产品，招引精深加工、冷链物流、品牌营销项目。\n\n' +
            '6️⃣ 文化旅游\n   挖掘红色文化、岐黄文化、农耕文化，招引文旅融合项目。\n\n' +
            '如需了解某一方向的具体目标企业，请告诉我。';
        }
        if (question.indexOf('新能源') >= 0 || question.indexOf('目标企业') >= 0) {
          return '【新能源产业链目标企业推荐】\n\n' +
            '🔹 整机及核心部件\n   金风科技、远景能源、明阳智能、阳光电源、隆基绿能、晶科能源等\n\n' +
            '🔹 储能产业\n   宁德时代、比亚迪储能、国轩高科、亿纬锂能、鹏辉能源等\n\n' +
            '🔹 氢能产业\n   亿华通、美锦能源、厚普股份、雪人股份等\n\n' +
            '🔹 本地配套\n   线缆、塔筒、叶片、支架等配套企业\n\n' +
            '💡 招商建议：\n   1. 以资源换产业，以市场换投资\n   2. 建设新能源装备制造产业园\n   3. 出台专项扶持政策\n   4. 开展产业链精准招商\n\n' +
            '如需某类企业的详细名单和招商路径，请进一步说明。';
        }
        if (question.indexOf('数字经济') >= 0) {
          return '【数字经济产业招商路径】\n\n' +
          '1️⃣ 算力基础设施\n   依托全国一体化算力网络国家枢纽节点建设，招引大型数据中心、智算中心项目。\n\n' +
          '2️⃣ 软件和信息技术服务\n   招引工业软件、行业应用、信创产业、网络安全企业。\n\n' +
          '3️⃣ 人工智能\n   招引AI大模型、智能语音、计算机视觉、智能制造解决方案企业。\n\n' +
          '4️⃣ 大数据产业\n   招引数据标注、数据交易、数据安全、大数据分析企业。\n\n' +
          '目标企业：华为、腾讯、阿里、百度、科大讯飞、中科曙光、紫光集团等。\n\n' +
          '招商策略：场景驱动招商，以庆阳丰富的应用场景吸引企业落地。';
        }
        return '我可以为您提供招商谋划服务。您可以：\n\n' +
          '• 了解庆阳市重点招商方向\n' +
          '• 获取某产业链目标企业推荐\n' +
          '• 咨询招商策略和路径\n' +
          '• 分析项目落地可行性\n\n' +
          '请问您关注哪个产业方向？';

      case 'service':
        if (question.indexOf('高新技术') >= 0 || question.indexOf('高企') >= 0) {
          return '【高新技术企业认定指南】\n\n' +
            '📋 认定条件：\n' +
            '1. 企业申请认定时须注册成立一年以上\n' +
            '2. 拥有核心自主知识产权\n' +
            '3. 属于国家重点支持的高新技术领域\n' +
            '4. 科技人员占企业当年职工总数的比例不低于10%\n' +
            '5. 研究开发费用占销售收入比例符合要求\n   • 5000万以下：≥5%\n   • 5000万-2亿：≥4%\n   • 2亿以上：≥3%\n' +
            '6. 高新技术产品（服务）收入占企业同期总收入的比例不低于60%\n' +
            '7. 企业创新能力评价达到相应要求\n\n' +
            '📅 申报时间：每年5-9月（以当年通知为准）\n\n' +
            '💰 政策支持：\n' +
            '• 减按15%税率征收企业所得税\n' +
            '• 研发费用加计扣除\n' +
            '• 市级奖励资金\n' +
            '• 项目申报优先支持\n\n' +
            '如需协助申报，可联系科技局或通过平台提交诉求。';
        }
        if (question.indexOf('稳岗') >= 0 || question.indexOf('补贴') >= 0) {
          return '【稳岗补贴申请指南】\n\n' +
            '📋 申请条件：\n' +
            '1. 依法参加失业保险并足额缴纳失业保险费\n' +
            '2. 上年度未裁员或裁员率低于城镇调查失业率控制目标\n' +
            '3. 企业生产经营活动符合国家及所在区域产业结构调整和环保政策\n\n' +
            '💰 补贴标准：\n' +
            '• 大型企业：按企业及其职工上年度实际缴纳失业保险费的50%返还\n' +
            '• 中小微企业：按60%返还\n\n' +
            '📝 申请材料：\n' +
            '1. 稳岗补贴申请表\n' +
            '2. 营业执照复印件\n' +
            '3. 失业保险缴费证明\n' +
            '4. 职工花名册\n\n' +
            '📅 办理流程：线上申请 → 部门审核 → 公示 → 资金拨付\n\n' +
            '办理时限：30个工作日\n\n' +
            '您可以通过"甘快办"APP或人社部门官网在线申请。';
        }
        if (question.indexOf('诉求') >= 0 || question.indexOf('提交') >= 0) {
          return '【企业诉求提交方式】\n\n' +
            '您可以通过以下多种渠道提交企业诉求：\n\n' +
            '1️⃣ 平台在线提交\n   在本平台"企业诉求"模块填写诉求表单，相关部门将在3个工作日内响应。\n\n' +
            '2️⃣ 企业服务热线\n   拨打 12345 政务服务便民热线，选择"企业服务"专席。\n\n' +
            '3️⃣ 企业联络员\n   每家重点企业配备 1 名服务联络员，可直接联系对接。\n\n' +
            '4️⃣ 政企座谈会\n   定期组织政企面对面交流活动，现场协调解决问题。\n\n' +
            '📊 诉求办理时限：\n' +
            '• 一般诉求：5个工作日内答复\n' +
            '• 复杂诉求：15个工作日内答复\n' +
            '• 疑难诉求：挂牌督办，定期反馈进展\n\n' +
            '请问您有什么具体诉求？我可以帮您登记。';
        }
        return '我是企业服务智能体，可以为您提供：\n\n' +
          '• 政策咨询与解读\n' +
          '• 办事流程指引\n' +
          '• 申报条件查询\n' +
          '• 诉求提交与跟踪\n' +
          '• 惠企政策匹配\n\n' +
          '请问有什么可以帮您？您也可以直接描述您遇到的问题。';

      default:
        return '您好，请问有什么可以帮您？';
    }
  }

  function findEnterpriseInText(text) {
    for (var i = 0; i < M.ENTERPRISES.length; i++) {
      if (text.indexOf(M.ENTERPRISES[i].name) >= 0) return M.ENTERPRISES[i];
    }
    return null;
  }

  function topRiskDims(e) {
    var dims = M.RISK_DIMS.filter(function(d){return d.weight>0;}).slice().sort(function(a,b){
      return (e.risks[b.key]||0) - (e.risks[a.key]||0);
    });
    return dims.slice(0, 2).map(function(d){return d.name;}).join('、');
  }

  function topRiskList(e) {
    var dims = M.RISK_DIMS.filter(function(d){return d.weight>0;}).slice().sort(function(a,b){
      return (e.risks[b.key]||0) - (e.risks[a.key]||0);
    });
    return dims.slice(0, 3).map(function(d, i){
      return (i+1) + '. ' + d.name + '风险：' + (e.risks[d.key]||0) + ' 分';
    }).join('\n');
  }

  APP.registerRenderer('aidemo', renderAiDemo);
})();
