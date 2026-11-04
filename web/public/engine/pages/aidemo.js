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

  /* ------------------------------------------------------------
   * 大模型输出渲染：统一走 APP.U.md()（Markdown 子集解析器）
   * 流式与完成态共用同一函数——否则打字时满屏 ** ## |，打完才突变。
   * 流式用「最后一个空行之前」的前缀缓存：已完成块只解析一次，
   * 每帧只重算尾部一个未闭合块，800 字量级无可感延迟。
   * ------------------------------------------------------------ */
  function renderAIText(raw) {
    return U.md(raw);
  }

  function renderAITextStream(holder, raw) {
    if (!holder) return;
    var s = String(raw == null ? '' : raw);
    var cut = s.lastIndexOf('\n\n');
    if (cut < 0) { holder.innerHTML = U.md(s); return; }
    var head = s.slice(0, cut);
    var tail = s.slice(cut);
    if (holder.__mdHead !== head) {
      holder.__mdHead = head;
      holder.__mdHtml = U.md(head);
    }
    holder.innerHTML = holder.__mdHtml + U.md(tail);
  }

  /* ------------------------------------------------------------
   * 对话成果物下载：模型回答一键落成文件（纯前端，不占服务端带宽）
   *   - 回答里含 Markdown 表格 → 导出 CSV（复用 C.exportCSV，带 BOM 防 Excel 乱码）
   *   - 任意回答 → 导出原始 Markdown，保留结构给汇报/存档用
   * ------------------------------------------------------------ */
  function mdSplitPipe(line) {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) {
      return c.trim().replace(/\*\*/g, '').replace(/`/g, '');
    });
  }

  /** 取回答里的第一张 Markdown 表格；没有则返回 null */
  function aiExtractTable(text) {
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      var head = lines[i].trim();
      var sep = (lines[i + 1] || '').trim();
      if (/^\|.*\|$/.test(head) && /^\|[\s:|-]*$/.test(sep) && sep.indexOf('-') > -1) {
        var rows = [];
        var j = i + 2;
        while (j < lines.length && /^\|.*\|$/.test(lines[j].trim())) {
          rows.push(mdSplitPipe(lines[j].trim()));
          j++;
        }
        return { head: mdSplitPipe(head), rows: rows };
      }
    }
    return null;
  }

  function dlStamp() {
    var d = new Date();
    var p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function downloadTextFile(name, text, mime) {
    // data URI 而非 Blob URL：file:// 直开 demo 时 download 属性才稳定生效
    var url = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent('\ufeff' + text);
    var a = U.el('a', { href: url, download: name, style: 'display:none;' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 200);
  }

  function downloadAiAnswer(idx, kind) {
    var msg = (conversations[currentAgent] || [])[idx];
    if (!msg || !msg.content) return;
    var agent = agents.filter(function (a) { return a.key === currentAgent; })[0] || agents[0];
    var base = (agent ? agent.name : 'AI回答') + '-' + dlStamp();

    // PDF：交服务端渲染（中文字体子集化，50–200KB/份），失败明确提示而不是静默
    if (kind === 'pdf') {
      var plain = U.mdPlain(msg.content).split('\n').filter(function (x) { return x.trim(); });
      var subtitle = (plain[0] || '').replace(/【|】/g, '').slice(0, 46);
      C.toast('正在生成 PDF…', 'info');
      U.exportAnswer({
        format: 'pdf',
        title: (agent ? agent.name : 'AI') + '分析报告',
        subtitle: subtitle,
        meta: ['智能体：' + (agent ? agent.name : 'AI'), '生成时间：' + U.fmtDateTime(new Date()), '数据来源：平台实时数据'],
        markdown: msg.content
      }).then(function (name) {
        C.toast('已生成 PDF：' + name, 'success');
      }).catch(function (e) {
        C.toast((e && e.message) || 'PDF 导出失败', 'warning');
      });
      return;
    }

    if (kind === 'csv') {
      var t = aiExtractTable(msg.content);
      if (!t) { C.toast('这条回答里没有可导出的表格', 'warning'); return; }
      C.exportCSV(base, t.head, t.rows);
      C.toast('已导出表格 ' + t.rows.length + ' 行', 'success');
      return;
    }
    downloadTextFile(base + '.md', msg.content, 'text/markdown');
    C.toast('已导出 Markdown 文件', 'success');
  }

  /** 附件卡片：服务端随回答返回的文件（files[]）或模型自己给出的文件链接 */
  function fileCardHtml(f, i, fromLink) {
    var name = f.name || '附件';
    var ext = String(f.kind || (name.split('.').pop() || 'file')).toLowerCase();
    var tag = ext === 'docx' || ext === 'doc' ? 'DOC' : ext === 'pdf' ? 'PDF' : ext === 'xlsx' || ext === 'csv' ? 'XLS' : 'FILE';
    var kb = '';
    if (f.size) kb = f.size >= 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
    return '<button class="msg-file" data-file-idx="' + i + '"' + (fromLink ? ' data-file-link="1"' : '') +
        ' title="点击下载 ' + U.esc(name) + '">' +
      '<span class="mf-ico ' + ext + '">' + tag + '</span>' +
      '<span class="mf-meta">' +
        '<span class="mf-name">' + U.esc(name) + '</span>' +
        '<span class="mf-sub">' + ext.toUpperCase() + (kb ? ' · ' + kb : '') + ' · 点击下载</span>' +
      '</span>' +
      '<span class="mf-dl" aria-hidden="true">↓</span>' +
    '</button>';
  }

  function fileCardsHtml(msg) {
    var list = (msg && msg.files) || [];
    var html = list.map(function (f, i) { return fileCardHtml(f, i, false); }).join('');
    // 模型在正文里直接给出 .pdf/.docx 链接时，也转成同款卡片（原生链接在对话气泡里不可点）
    var links = U.mdFileLinks(msg && msg.content);
    if (links.length) {
      var seen = {};
      html += links.filter(function (l) {
        if (seen[l.url]) return false;
        seen[l.url] = 1;
        return !list.some(function (f) { return f.name === l.name; });
      }).map(function (l, i) {
        return fileCardHtml({ name: l.name, kind: l.ext, url: l.url }, list.length + i, true);
      }).join('');
    }
    return html ? '<div class="msg-files">' + html + '</div>' : '';
  }

  /* ------------------------------------------------------------
   * 大模型调用：走后端 /api/ai/chat/:agentType
   * 后端已注入平台实时数据 + 多轮历史，此处只负责传输与失败回退。
   * 纯前端离线打开 demo/index.html 时 fetch 会失败，自动回退本地预脚本回复。
   * ---------------------------------------------------------- */
  function getToken() {
    try { return localStorage.getItem('zs_token') || ''; } catch (e) { return ''; }
  }

  function callAI(agentKey, text) {
    var token = getToken();
    if (!token || typeof fetch !== 'function') {
      return Promise.reject(new Error('未登录或无 fetch 能力'));
    }
    return fetch('/api/ai/chat/' + encodeURIComponent(agentKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ message: text })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.code === 0 && j.data && j.data.reply) {
        return {
          reply: String(j.data.reply),
          files: Array.isArray(j.data.files) ? j.data.files : []
        };
      }
      throw new Error((j && j.msg) || '返回格式异常');
    });
  }

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
    // 成果物下载（事件委托：消息区会整块重绘，不能逐条绑）
    var dlBox = U.$('#aiMessages');
    if (dlBox) {
      dlBox.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        // 附件卡片：服务端文件（files[]）或回答里给出的文件链接
        var card = t.closest('.msg-file');
        if (card) {
          var msgNode = t.closest('.msg');
          var idx2 = msgNode ? Array.prototype.indexOf.call(dlBox.querySelectorAll('.msg'), msgNode) : -1;
          var m2 = (conversations[currentAgent] || [])[idx2];
          var fi = +card.getAttribute('data-file-idx');
          var f2 = null;
          if (card.getAttribute('data-file-link') === '1') {
            var links = U.mdFileLinks(m2 && m2.content);
            var offset = ((m2 && m2.files) || []).length;
            f2 = links[fi - offset];
          } else {
            f2 = m2 && m2.files ? m2.files[fi] : null;
          }
          if (!f2) { C.toast('附件已失效，请重新提问', 'warning'); return; }
          C.toast('正在下载…', 'info');
          U.downloadAttachment(f2.url, f2.name).then(function () {
            C.toast('已下载 ' + (f2.name || '附件'), 'success');
          }).catch(function (err) {
            C.toast((err && err.message) || '下载失败', 'warning');
          });
          return;
        }
        var btn = t.closest('.msg-tool');
        if (!btn) return;
        downloadAiAnswer(+btn.getAttribute('data-idx'), btn.getAttribute('data-dl'));
      });
    }
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
        return ['分析一下甘肃赫隆能源科技技术有限公司', '庆阳市营收前5的企业有哪些？', '新能源行业发展趋势如何'];
      case 'risk':
        return ['当前有哪些重大风险企业？', '分析甘肃宁州华凯能源有限公司的主要风险点', '近30天新增了哪些风险事件'];
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
  function msgToHtml(msg, idx) {
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
      : '<div class="msg-text">' + renderAIText(msg.content) + '</div>';
    return '<div class="msg ' + (isUser ? 'msg-user' : 'msg-ai') + '">' +
      '<div class="msg-avatar' + (isUser ? ' user' : '') + '" style="' + (isUser ? '' : 'background:' + agent.grad + ';') + '">' + avatar + '</div>' +
      '<div class="msg-body">' +
        '<div class="msg-name" style="display:flex;align-items:baseline;gap:8px;"><span>' + name + '</span>' +
          (time ? '<span style="font-size:10px;color:#CBD5E1;font-weight:400;">' + time + '</span>' : '') + '</div>' +
        contentHtml +
        (!isUser && msg.type !== 'thinking' ? fileCardsHtml(msg) : '') +
        (!isUser && msg.type !== 'thinking' && msg.content
          ? '<div class="msg-tools">' +
              '<button class="msg-tool" data-dl="md" data-idx="' + idx + '" title="把这条回答保存为 Markdown 文件">下载 MD</button>' +
              '<button class="msg-tool" data-dl="pdf" data-idx="' + idx + '" title="把这条回答排版成 A4 PDF 下载">下载 PDF</button>' +
              (aiExtractTable(msg.content)
                ? '<button class="msg-tool" data-dl="csv" data-idx="' + idx + '" title="把回答中的表格导出为 CSV">下载表格 CSV</button>'
                : '') +
            '</div>'
          : '') +
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
      // 先占位一条空消息并渲染，供流式输出逐字填充
      var msg = { role: 'assistant', type: 'text', content: '', ts: Date.now() };
      conv.push(msg);
      refreshMessages();

      // 优先真实大模型；失败（离线/超时/未登录）回退本地预脚本回复
      callAI(currentAgent, text).then(function(res){
        var reply = res && res.reply;
        if (!reply || !String(reply).trim()) throw new Error('大模型返回空内容');
        // 附件先挂到消息上：打字过程只更新正文，打完 refreshMessages 才会渲染卡片
        msg.files = (res && res.files) || [];
        typeOut(msg, String(reply));
      }).catch(function(err){
        console.warn('[aidemo] 大模型不可用，回退本地回复：', err && err.message ? err.message : err);
        msg.files = [];
        var fallback;
        try {
          fallback = generateReply(currentAgent, text);
        } catch (e) {
          console.error('[aidemo] 回复生成异常', e);
          fallback = '您的问题我已记录，但处理过程中遇到异常，请换个问法或稍后再试。';
        }
        typeOut(msg, fallback);
      });
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
    // 流式与完成态共用同一渲染函数（U.md），避免打字时露出 ** ## |
    renderAITextStream(txt, msg.content);
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
    msgBox.innerHTML = conv.map(function (m, i) { return msgToHtml(m, i); }).join('');
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  /* ============================================================
   * 本地推理引擎（离线演示模式）
   * ------------------------------------------------------------
   * 有后端时 sendMessage 优先调 /api/ai/chat（真大模型 + 平台实时数据）；
   * 无后端（GitHub Pages 静态部署、本地直接打开 demo/index.html）时
   * 由本引擎基于 MOCK 真实数据现场生成回答。
   *
   * 设计要点（2026-11-04 重写）：四个智能体都必须能"自由对话"——
   * 旧版只对几个写死关键词有反应，非 insight 的三个智能体问什么都回同一段
   * 固定菜单（例：风险智能体问"甘肃圣越农牧有什么风险"只回"我可以为您提供
   * 风险分析服务…"），表现为"不能正常对话"。现改为：
   *   ① 先做实体识别：企业（含简称）/ 区县 / 行业 / 风险等级 / 排名 / 政策；
   *   ② 再按智能体职责组装**数据化**回答（数字全部来自 MOCK 实时数据）；
   *   ③ 识别不到具体实体时，给出平台实况摘要 + 与职责相关的可问示例，
   *      而不是一句空菜单。
   * ============================================================ */
  var ADMIN_PREFIX = /^(甘肃省|甘肃|庆阳市|庆阳|西峰区|庆城县|环县|华池县|合水县|正宁县|宁县|镇原县)/;
  var ENT_SUFFIX = /(有限责任公司|股份有限公司|有限公司|集团公司|集团|公司|厂|场)$/;

  /** 企业名核心字号：去掉行政区前缀与企业类型后缀（"甘肃圣越农牧发展有限公司"→"圣越农牧发展"） */
  function entCore(name) {
    var s = String(name || '').replace(ADMIN_PREFIX, '');
    s = s.replace(ENT_SUFFIX, '');
    return s;
  }

  /** 在企业池中识别被问到的企业：先全名，再核心字号（支持"圣越农牧""圣越"这类简称） */
  function resolveEnterprise(text) {
    var q = String(text || '');
    var i, e, best = null, bestLen = 0;
    for (i = 0; i < M.ENTERPRISES.length; i++) {
      e = M.ENTERPRISES[i];
      if (q.indexOf(e.name) >= 0) return e;
    }
    for (i = 0; i < M.ENTERPRISES.length; i++) {
      e = M.ENTERPRISES[i];
      var core = entCore(e.name);
      if (core.length >= 2 && q.indexOf(core) >= 0 && core.length > bestLen) {
        best = e; bestLen = core.length; continue;
      }
      // 弱匹配：用户只打了字号前 4 字（≥3 字才用，避免"庆阳""甘肃"这类通用词误中）
      if (core.length >= 4 && q.indexOf(core.slice(0, 4)) >= 0 && bestLen < 4) {
        best = e; bestLen = 4;
      }
    }
    return best;
  }

  function resolveDistrict(text) {
    var q = String(text || '');
    for (var i = 0; i < M.DISTRICTS.length; i++) {
      var d = M.DISTRICTS[i];
      var short = String(d.name).replace(/[区县]$/, '');
      if (q.indexOf(d.name) >= 0 || (short.length >= 2 && q.indexOf(short) >= 0)) return d;
    }
    return null;
  }

  function resolveIndustry(text) {
    var q = String(text || '');
    var hit = null;
    for (var i = 0; i < M.INDUSTRIES.length; i++) {
      var ind = M.INDUSTRIES[i];
      var key = String(ind.name || '');
      var short = key.replace(/与.*$/, '').replace(/(装备制造|制造|加工|创意|贸易|物流|服务|技术)$/, '');
      if (q.indexOf(key) >= 0 || (short.length >= 2 && q.indexOf(short) >= 0)) {
        if (!hit || key.length > hit.name.length) hit = ind;
      }
    }
    return hit;
  }

  /** 区县主键：M.DISTRICTS 在 demo 引擎里可能是 id 或 key，两种都兼容 */
  function distKey(d) {
    return d ? (d.id || d.key || '') : '';
  }

  function entOfDistrict(d) {
    var k = distKey(d);
    if (!k) return [];
    return M.ENTERPRISES.filter(function (e) { return e.district === k || e.districtId === k; });
  }

  function sumBy(list, f) {
    return list.reduce(function (s, e) { return s + (Number(f(e)) || 0); }, 0);
  }

  function levelName(lv) { return (M.LEVELS[lv] || {}).name || lv; }

  function riskBuckets(list) {
    var b = { red: 0, orange: 0, yellow: 0, blue: 0 };
    list.forEach(function (e) { if (b[e.riskLevel] != null) b[e.riskLevel]++; });
    return b;
  }

  function bucketLine(list) {
    var b = riskBuckets(list);
    return '红色 ' + b.red + ' 家 / 橙色 ' + b.orange + ' 家 / 黄色 ' + b.yellow + ' 家 / 蓝色 ' + b.blue + ' 家';
  }

  /** 企业一行数据摘要，回答里复用 */
  function entLine(e) {
    var ov = e.overview || {};
    return e.name + '（' + (e.districtName || '—') + '·' + (e.industryName || '—') + '，风险' +
      e.riskScore + '分/' + levelName(e.riskLevel) + '，营收' + (ov.revenue || '—') +
      '，纳税' + (ov.tax || '—') + '）';
  }

  /** 该区县的行业结构，取前 n */
  function districtIndustryTop(list, n) {
    var m = {};
    list.forEach(function (e) {
      var k = e.industryName || '未分类';
      m[k] = m[k] || { n: 0, rev: 0 };
      m[k].n++;
      m[k].rev += Number((e.overview || {}).revenueWan) || 0;
    });
    return Object.keys(m).map(function (k) { return { name: k, n: m[k].n, rev: m[k].rev }; })
      .sort(function (a, b) { return b.n - a.n || b.rev - a.rev; }).slice(0, n || 3);
  }

  /** 按企业标签 + 行业 + 规模匹配政策库 */
  function matchPolicies(e, limit) {
    var tags = (e.tags || []).join(' ');
    var text = [e.name, e.industryName || '', tags, e.scale || ''].join(' ');
    var keys = ['高新', '专精特新', '数据', '算力', '农业', '农副', '食品', '能源', '化工', '文旅',
                '物流', '人才', '税收', '金融', '用地', '电价', '固投', '研发', '就业', '外资', '中小企业'];
    var hitKeys = keys.filter(function (k) { return text.indexOf(k) >= 0; });
    var lib = (M.POLICY_LIB || []);
    var hits = lib.filter(function (p) {
      var s = [p.name, p.type, p.tag, p.apply].join(' ');
      return hitKeys.some(function (k) { return s.indexOf(k) >= 0; });
    });
    if (!hits.length) hits = lib.slice(0, limit || 3);
    return hits.slice(0, limit || 5);
  }

  function topNByRevenue(n) {
    return M.ENTERPRISES.slice().sort(function (a, b) {
      return (Number((b.overview || {}).revenueWan) || 0) - (Number((a.overview || {}).revenueWan) || 0);
    }).slice(0, n);
  }

  function topNByRisk(n) {
    return M.ENTERPRISES.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).slice(0, n);
  }

  /* ---------------- 四个智能体的数据化回答 ---------------- */

  function answerInsight(q) {
    var ent = resolveEnterprise(q);
    if (ent) {
      var ov = ent.overview || {};
      var op = ent.operation || {};
      var rev = op.revenue || [];
      var trend = (rev.length > 5 && rev[5] > rev[0]) ? '上升' : '回落';
      return '【' + ent.name + ' 企业洞察报告】\n\n' +
        '**基本概况**：成立于 ' + ent.found + '，注册资本 ' + (ov.regCapital || '—') + '，位于' + (ent.districtName || '—') +
        '，属' + (ent.industryName || '—') + '行业' + (ent.scale ? '，' + ent.scale : '') +
        '。从业人数 ' + (ov.employees == null ? '未公示' : ov.employees + ' 人') + '。\n\n' +
        '**经营业绩**：年营收 ' + (ov.revenue || '—') + '，年纳税 ' + (ov.tax || '—') +
        '，固定资产投资 ' + (ov.invest || '—') + '，净利润 ' + (ov.profit || '—') +
        (rev.length > 5 ? '。近 6 个月营收呈' + trend + '趋势。' : '。') + '\n\n' +
        '**风险评估**：综合风险指数 ' + ent.riskScore + ' 分（' + levelName(ent.riskLevel) +
        '），主要风险维度：' + topRiskDims(ent) + '。\n\n' +
        '**综合评价**：' + (ent.riskLevel === 'red' ? '风险较高，建议列为重点监测对象，加强日常预警与处置。'
          : ent.riskLevel === 'orange' ? '存在一定风险隐患，建议持续跟踪经营变化，及时做好风险化解。'
          : '经营状况总体良好，建议保持良性互动，推动企业做优做强。');
    }
    var d = resolveDistrict(q);
    if (d) {
      var list = entOfDistrict(d);
      var top = districtIndustryTop(list, 3).map(function (x) { return x.name + ' ' + x.n + ' 家'; }).join('、');
      return '【' + d.name + ' 产业画像】\n\n' +
        '企业总数 **' + list.length + ' 家**，营收合计 **' + (sumBy(list, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元**，' +
        '从业人数合计 ' + sumBy(list, function (e) { return (e.overview || {}).employees; }) + ' 人。\n\n' +
        '行业结构：' + top + '。\n\n' +
        '风险分布：' + bucketLine(list) + '。\n\n' +
        '营收前三：' + topNByRevenueFrom(list, 3).map(function (e) { return e.name + '（' + (e.overview || {}).revenue + '）'; }).join('、') + '。';
    }
    var ind = resolveIndustry(q);
    if (ind) {
      var lst = M.ENTERPRISES.filter(function (e) { return e.industryName === ind.name; });
      var avg = lst.length ? Math.round(sumBy(lst, function (e) { return e.riskScore; }) / lst.length) : 0;
      return '【' + ind.name + ' 产业分析】\n\n' +
        '企业 **' + lst.length + ' 家**，营收合计 **' + (sumBy(lst, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元**，' +
        '平均风险分 **' + avg + ' 分**。\n\n' +
        '风险分布：' + bucketLine(lst) + '。\n\n' +
        '代表企业：' + topNByRevenueFrom(lst, 3).map(function (e) { return e.name + '（营收' + (e.overview || {}).revenue + '，风险' + e.riskScore + '分）'; }).join('、') + '。';
    }
    if (/前\s*\d|top|排名|排行|营收|最大|龙头/i.test(q)) {
      var top5 = topNByRevenue(5);
      return '【营收 TOP5 企业】\n\n' + top5.map(function (e, i) {
        return (i + 1) + '. ' + entLine(e);
      }).join('\n') + '\n\n这 5 家覆盖' + top5[0].industryName + '、' + (top5[1] || {}).industryName +
        '等重点产业，是全市工业经济的核心支撑。';
    }
    if (/新能源|趋势|态势/.test(q)) {
      var ne = null;
      M.INDUSTRIES.forEach(function (i) { if (i.key === 'newEnergy' || i.key === 'neequip') ne = i; });
      var neList = M.ENTERPRISES.filter(function (e) { return e.industry === 'neequip' || e.industry === 'newEnergy'; });
      return '【新能源产业态势】\n\n' +
        '1. 产业规模：相关企业 ' + (ne ? ne.count : neList.length) + ' 家，营收合计 ' +
        (sumBy(neList, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元。\n\n' +
        '2. 代表企业：' + neList.slice(0, 4).map(function (e) { return e.name; }).join('、') + '。\n\n' +
        '3. 发展条件：庆阳风光资源富集，是国家重要新能源基地，风电、光伏装机持续增长。\n\n' +
        '4. 建议：围绕"源网荷储"一体化延链补链，优先补齐装备制造与储能环节。';
    }
    // 兜底：给平台实况 + 可问示例，不留空菜单
    var all = M.ENTERPRISES;
    return '当前平台入库 **' + all.length + ' 家企业**，营收合计 **' +
      (sumBy(all, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元**，' +
      '风险分布：' + bucketLine(all) + '。\n\n' +
      '可以这样问我：\n' +
      '· “甘肃圣越农牧的经营情况怎么样”（企业洞察报告）\n' +
      '· “镇原县的产业结构如何”（区县画像）\n' +
      '· “营收排名前五的企业有哪些”（排名）';
  }

  function answerRisk(q) {
    var ent = resolveEnterprise(q);
    if (ent) {
      return '【' + ent.name + ' 风险研判报告】\n\n' +
        '**综合风险等级**：' + levelName(ent.riskLevel) + '（' + ent.riskScore + ' 分）\n\n' +
        '**八维风险分值**：\n' +
        M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
          var v = ent.risks[d.key] || 0;
          var lv = v >= 65 ? '🔴' : v >= 45 ? '🟠' : v >= 25 ? '🟡' : '🔵';
          return '  ' + lv + ' ' + d.name + '：' + v + ' 分（权重 ' + Math.round(d.weight * 100) + '%）';
        }).join('\n') + '\n\n' +
        '**主要风险点**：\n' + topRiskList(ent) + '\n\n' +
        '**处置建议**：\n' +
        '1. 建立企业风险监测台账，实施周监测、月研判；\n' +
        '2. 约谈企业负责人，掌握经营困难，研究帮扶措施；\n' +
        '3. 协调相关部门提前做好风险应对预案；\n' +
        '4. 引导企业转型升级，提升抗风险能力。';
    }
    var d = resolveDistrict(q);
    if (d) {
      var list = entOfDistrict(d).slice().sort(function (a, b) { return b.riskScore - a.riskScore; });
      var risky = list.filter(function (e) { return e.riskScore >= 45; });
      return '【' + d.name + ' 风险分布】\n\n' +
        '企业 ' + list.length + ' 家，' + bucketLine(list) + '。\n\n' +
        '高风险（≥45 分）企业 ' + risky.length + ' 家：\n' +
        (risky.length ? risky.slice(0, 6).map(function (e, i) {
          return (i + 1) + '. ' + entLine(e) + '，高分维度：' + topRiskDims(e);
        }).join('\n') : '  无') + '\n\n' +
        (risky.length ? '建议对上述企业开展"一企一策"核查，红色企业 24 小时内派单。'
          : '该区县整体风险可控，保持季度常规巡检即可。');
    }
    var ind = resolveIndustry(q);
    if (ind) {
      var il = M.ENTERPRISES.filter(function (e) { return e.industryName === ind.name; })
        .sort(function (a, b) { return b.riskScore - a.riskScore; });
      var avg = il.length ? Math.round(sumBy(il, function (e) { return e.riskScore; }) / il.length) : 0;
      return '【' + ind.name + ' 行业风险】\n\n' +
        '企业 ' + il.length + ' 家，平均风险分 **' + avg + ' 分**，' + bucketLine(il) + '。\n\n' +
        '风险排序（前 5）：\n' + il.slice(0, 5).map(function (e, i) {
          return (i + 1) + '. ' + entLine(e) + '，高分维度：' + topRiskDims(e);
        }).join('\n');
    }
    if (/新增|近\s*30\s*天|30\s*天|近期/.test(q)) {
      var nr = (M.RISK_EVENTS || []).filter(function (e) { return (e.daysAgo || 0) <= 30; });
      return '【近 30 天新增风险事件】\n\n' +
        '新增 **' + nr.length + ' 件**，其中红色 ' + nr.filter(function (e) { return e.level === 'red'; }).length +
        ' 件、橙色 ' + nr.filter(function (e) { return e.level === 'orange'; }).length + ' 件。\n\n' +
        '建议：新增重大风险 24 小时内派单核查，橙色 72 小时内约谈企业。';
    }
    if (/红色|重大风险|高风险|哪些|清单/.test(q) || !q) {
      var red = M.ENTERPRISES.filter(function (e) { return e.riskLevel === 'red'; })
        .sort(function (a, b) { return b.riskScore - a.riskScore; });
      var orange = M.ENTERPRISES.filter(function (e) { return e.riskLevel === 'orange'; });
      return '【重大风险企业清单】\n\n' +
        '全市 88 家企业风险分布：' + bucketLine(M.ENTERPRISES) + '。\n\n' +
        '红色（≥65 分）共 **' + red.length + ' 家**：\n' +
        red.map(function (e, i) {
          return (i + 1) + '. ' + e.name + '（' + e.districtName + '，' + e.riskScore + ' 分，主要风险：' + topRiskDims(e) + '）';
        }).join('\n') +
        '\n\n橙色（45-64 分）共 **' + orange.length + ' 家**，可在风险预警页按等级筛选查看。\n\n' +
        '建议：红色企业 24 小时内派单核查，橙色 72 小时内约谈，黄/蓝按月度跟踪。';
    }
    // 兜底
    var top = topNByRisk(3);
    return '全市 **' + M.ENTERPRISES.length + ' 家企业**风险分布：' + bucketLine(M.ENTERPRISES) + '。\n\n' +
      '当前综合分最高的 3 家：\n' + top.map(function (e, i) {
        return (i + 1) + '. ' + entLine(e) + '，高分维度：' + topRiskDims(e);
      }).join('\n') + '\n\n' +
      '可以这样问我：\n' +
      '· “甘肃圣越农牧有什么风险”（单企业研判）\n' +
      '· “宁县的风险企业有哪些”（区县风险）\n' +
      '· “近 30 天新增了哪些风险事件”';
  }

  function answerPlan(q) {
    var d = resolveDistrict(q);
    var ind = resolveIndustry(q);
    var ent = resolveEnterprise(q);

    if (ent) {
      var peers = M.ENTERPRISES.filter(function (e) { return e.industryName === ent.industryName; });
      return '【' + ent.name + ' 招商价值研判】\n\n' +
        '**产业定位**：' + (ent.industryName || '—') + '，' + (ent.districtName || '—') +
        '，' + (ent.scale || '—') + '，' + (ent.isKey ? '**已列为重点企业**' : '非重点企业') + '。\n\n' +
        '**经营体量**：营收 ' + ((ent.overview || {}).revenue || '—') + '，纳税 ' + ((ent.overview || {}).tax || '—') +
        '，从业 ' + ((ent.overview || {}).employees == null ? '未公示' : (ent.overview || {}).employees + ' 人') + '。\n\n' +
        '**产业链位置**：同行业全市共 ' + peers.length + ' 家，营收合计 ' +
        (sumBy(peers, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元。\n\n' +
        '**服务策略**：' + (ent.riskScore >= 45
          ? '先化解风险（' + topRiskDims(ent) + '），再谈扩产与配套招引。'
          : '经营稳健，可作为产业链招商的本地承接载体，围绕其上下游做补链招引。');
    }
    if (d) {
      var list = entOfDistrict(d);
      var top = districtIndustryTop(list, 3);
      return '【' + d.name + ' 招商基础】\n\n' +
        '企业 ' + list.length + ' 家，营收合计 ' + (sumBy(list, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元。\n\n' +
        '主导产业：' + top.map(function (x) { return x.name + '（' + x.n + ' 家）'; }).join('、') + '。\n\n' +
        '**招商方向建议**：\n' +
        '1. 围绕' + (top[0] ? top[0].name : '主导产业') + '做延链补链，优先招引上下游配套；\n' +
        '2. 存量企业中风险较高的（' + riskBuckets(list).red + ' 家红色）先行纾困，避免招商载体流失；\n' +
        '3. 结合本地资源禀赋设计场景招商，用市场换投资。';
    }
    if (ind) {
      var il = M.ENTERPRISES.filter(function (e) { return e.industryName === ind.name; });
      return '【' + ind.name + ' 产业链招商方案】\n\n' +
        '**本地基础**：企业 ' + il.length + ' 家，营收 ' + (sumBy(il, function (e) { return (e.overview || {}).revenueWan; }) / 10000).toFixed(1) + ' 亿元。\n\n' +
        '**招引重点**：\n' +
        '· 补链：本地缺失的关键环节（核心零部件、精深加工、检测认证）；\n' +
        '· 强链：现有龙头企业的扩产与技改项目；\n' +
        '· 延链：下游应用与品牌渠道。\n\n' +
        '**招商策略**：产业链招商 + 场景招商 + 基金招商，配套固投补贴与要素保障。\n\n' +
        '**本地承接载体**：' + il.slice(0, 3).map(function (e) { return e.name; }).join('、') + '。';
    }
    if (/新能源/.test(q)) {
      return '【新能源产业链招商方案】\n\n' +
        '一、目标方向：光伏、风电、储能、氢能及配套装备\n' +
        '二、本地基础：' + M.ENTERPRISES.filter(function (e) { return e.industry === 'neequip' || e.industry === 'newEnergy'; }).length + ' 家相关企业\n' +
        '三、招引重点：整机与核心部件、储能系统集成、氢能装备、线缆塔筒等配套\n' +
        '四、招商策略：以资源换产业、以市场换投资，建设新能源装备产业园\n' +
        '五、政策配套：固投补贴 + 电价优惠 + 场景开放';
    }
    if (/数字经济|数据|算力/.test(q)) {
      return '【数据信息产业招商方案】\n\n' +
        '一、目标方向：算力中心、大数据、人工智能、信创\n' +
        '二、本地基础：软件与信息技术企业 ' + M.ENTERPRISES.filter(function (e) { return e.industry === 'software'; }).length + ' 家\n' +
        '三、招商策略：算力资源换产业 + 场景驱动 + 人才政策\n' +
        '四、落地载体：大数据产业园、数字经济产业园\n\n' +
        '建议从算力中心项目切入，带动上下游生态企业集聚。';
    }
    if (/农业|农牧|食品/.test(q)) {
      return '【现代农业招商方案】\n\n' +
        '一、目标方向：农产品深加工、智慧农业、预制菜、种业\n' +
        '二、本地基础：农副食品加工企业 ' + M.ENTERPRISES.filter(function (e) { return e.industry === 'agrifood'; }).length + ' 家\n' +
        '三、招商策略：资源禀赋招商 + 产业链招商（庆阳苹果、小杂粮、肉羊）\n' +
        '四、重点环节：屠宰及肉类加工、果蔬精深加工、冷链物流';
    }
    // 兜底：真实产业格局 + 可问示例
    var byInd = {};
    M.ENTERPRISES.forEach(function (e) {
      var k = e.industryName || '未分类';
      byInd[k] = byInd[k] || { n: 0, rev: 0 };
      byInd[k].n++;
      byInd[k].rev += Number((e.overview || {}).revenueWan) || 0;
    });
    var rank = Object.keys(byInd).map(function (k) { return { k: k, n: byInd[k].n, rev: byInd[k].rev }; })
      .sort(function (a, b) { return b.rev - a.rev; });
    return '庆阳市现有产业格局（按营收排序）：\n' +
      rank.slice(0, 6).map(function (x, i) {
        return (i + 1) + '. ' + x.k + '：' + x.n + ' 家，营收 ' + (x.rev / 10000).toFixed(1) + ' 亿元';
      }).join('\n') + '\n\n' +
      '可以这样问我：\n' +
      '· “新能源产业怎么招”（产业链方案）\n' +
      '· “镇原县的招商基础如何”（区县画像）\n' +
      '· “甘肃圣越农牧的招商价值”（单企业）';
  }

  function answerService(q) {
    var ent = resolveEnterprise(q);
    if (ent) {
      var pols = matchPolicies(ent, 5);
      return '【' + ent.name + ' 政策匹配】\n\n' +
        '**企业画像**：' + (ent.districtName || '—') + '·' + (ent.industryName || '—') +
        '，' + (ent.scale || '—') + '，' + (ent.overview || {}).regCapital +
        '，从业 ' + ((ent.overview || {}).employees == null ? '未公示' : (ent.overview || {}).employees + ' 人') +
        (ent.tags && ent.tags.length ? '，标签：' + ent.tags.join('、') : '') + '。\n\n' +
        '**可关注政策 ' + pols.length + ' 条**：\n' +
        pols.map(function (p, i) {
          return (i + 1) + '. 《' + p.name + '》（' + p.level + '·' + p.dept + '）\n   ' + p.apply;
        }).join('\n') + '\n\n' +
        '**下一步**：可携带营业执照、财务报表、知识产权证明到对应主管部门申报；平台可代为登记诉求并跟踪办理进度。';
    }
    if (/高新|高企/.test(q)) {
      return '【高新技术企业认定指南】\n\n' +
        '📋 认定条件：\n' +
        '1. 注册成立一年以上；\n2. 拥有核心自主知识产权；\n3. 属于国家重点支持的高新技术领域；\n' +
        '4. 科技人员占比不低于 10%；\n5. 研发费用占销售收入比例达标（5000 万以下≥5%，5000 万-2 亿≥4%，2 亿以上≥3%）；\n' +
        '6. 高新技术产品收入占比不低于 60%。\n\n' +
        '📅 申报时间：每年 5-9 月（以当年通知为准）\n\n' +
        '💰 政策支持：减按 15% 征收企业所得税、研发费用加计扣除、市级奖励资金。';
    }
    if (/稳岗|补贴|返还/.test(q)) {
      return '【稳岗返还补贴】\n\n' +
        '📋 条件：依法参保并足额缴费；上年度未裁员或裁员率低于控制目标；生产经营符合产业与环保政策。\n\n' +
        '💰 标准：大型企业按上年度实际缴纳失业保险费的 50% 返还，中小微企业 60%。\n\n' +
        '📝 材料：申请表、营业执照、失业保险缴费证明、职工花名册。\n\n' +
        '📅 流程：线上申请 → 部门审核 → 公示 → 资金拨付，约 30 个工作日。';
    }
    if (/政策|匹配|申报|奖补/.test(q)) {
      var lib = M.POLICY_LIB || [];
      var byType = {};
      lib.forEach(function (p) { byType[p.type] = (byType[p.type] || 0) + 1; });
      return '【平台政策库】共 **' + lib.length + ' 条**\n\n' +
        Object.keys(byType).map(function (t) { return '· ' + t + '类 ' + byType[t] + ' 条'; }).join('\n') + '\n\n' +
        '代表性政策：\n' + lib.slice(0, 6).map(function (p, i) {
          return (i + 1) + '. 《' + p.name + '》（' + p.level + '·' + p.dept + '）：' + p.apply;
        }).join('\n') + '\n\n' +
        '告诉我企业名称，我可以按行业、规模、标签做具体匹配。';
    }
    if (/诉求|投诉|办理|办事/.test(q)) {
      return '【企业诉求提交与办事指引】\n\n' +
        '提交渠道：\n1. 平台"企业诉求"模块在线填报（3 个工作日内响应）；\n' +
        '2. 12345 政务服务热线企业服务专席；\n3. 重点企业联络员一对一对接；\n4. 政企座谈会现场协调。\n\n' +
        '办理时限：一般诉求 5 个工作日，复杂诉求 15 个工作日，疑难诉求挂牌督办。';
    }
    // 兜底：政策库实况 + 可问示例
    var lib2 = M.POLICY_LIB || [];
    return '平台政策库现有 **' + lib2.length + ' 条**惠企政策，覆盖' +
      (function () {
        var s = {};
        lib2.forEach(function (p) { s[p.type] = 1; });
        return Object.keys(s).join('、');
      })() + '等类别。\n\n' +
      '可以这样问我：\n' +
      '· “甘肃圣越农牧能申报哪些政策”（按企业匹配）\n' +
      '· “高新技术企业怎么认定”\n' +
      '· “稳岗补贴怎么申请”\n' +
      '· “企业诉求怎么提交”';
  }

  /** 区县内按营收取前 n（不排序原数组） */
  function topNByRevenueFrom(list, n) {
    return list.slice().sort(function (a, b) {
      return (Number((b.overview || {}).revenueWan) || 0) - (Number((a.overview || {}).revenueWan) || 0);
    }).slice(0, n);
  }

  function generateReply(agentKey, question) {
    var q = String(question || '').trim();
    try {
      if (agentKey === 'insight') return answerInsight(q);
      if (agentKey === 'risk') return answerRisk(q);
      if (agentKey === 'plan') return answerPlan(q);
      if (agentKey === 'service') return answerService(q);
    } catch (err) {
      // 本地推理兜底：宁可给保守回答，也不能让对话卡死
      return '您的问题我已记录，但本地数据推理遇到异常：' + (err && err.message ? err.message : err) +
        '。可以换个问法，或指定具体企业名称再试一次。';
    }
    return '您好，请问有什么可以帮您？';
  }

  /* 兼容旧调用点：findEnterpriseInText 已被 resolveEnterprise 取代 */
  function findEnterpriseInText(text) {
    return resolveEnterprise(text);
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
