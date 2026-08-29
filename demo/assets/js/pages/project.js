/* ============================================================
 * 页面：招商项目全生命周期
 * ============================================================ */
(function () {
  "use strict";
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  var STAGES = M.PROJECT_STAGES; // [{key,name,order}]

  // 关键词动态筛选：记录焦点与光标位置，重渲染后恢复，避免打字中断
  var kwState = { active: false, pos: null };
  var _recommendedCount = 0; // 已完成 AI 推荐的候选企业数

  function renderProject() {
    var f = state.filter.project;
    var P = M.PROJECTS;

    // 筛选
    var list = P.filter(function (p) {
      if (
        f.keyword &&
        p.name.indexOf(f.keyword) < 0 &&
        p.enterpriseName.indexOf(f.keyword) < 0
      )
        return false;
      if (f.stage && p.stage !== f.stage) return false;
      if (f.district && f.district !== "all" && p.district !== f.district)
        return false;
      if (f.owner && p.owner !== f.owner) return false;
      return true;
    });

    // 阶段统计（按阶段 key）
    var stageStats = {};
    STAGES.forEach(function (s) {
      stageStats[s.key] = 0;
    });
    P.forEach(function (p) {
      if (stageStats[p.stage] !== undefined) stageStats[p.stage]++;
    });

    var totalInv = P.reduce(function (s, p) {
      return s + (p.amountWan || 0);
    }, 0);
    var totalVal = Math.round((totalInv / 10000) * 10) / 10; // 亿

    // 本月有对接动态的项目数（最近一条对接记录落在本月，真实统计）
    var nowD = new Date();
    var monthPrefix =
      nowD.getFullYear() +
      "-" +
      (nowD.getMonth() < 9 ? "0" : "") +
      (nowD.getMonth() + 1);
    var monthActive = P.filter(function (p) {
      var r0 = p.records && p.records[0];
      return r0 && r0.date && String(r0.date).indexOf(monthPrefix) === 0;
    }).length;

    // 平均落地周期：已签约项目从"线索对接"到"签约落地"的平均天数（按关键节点真实计算）
    function nodeDate(p, name) {
      var tl = p.timeline || [];
      for (var i = 0; i < tl.length; i++) {
        if (tl[i].stage === name)
          return String(tl[i].date).replace("（计划）", "");
      }
      return null;
    }
    var cycleSum = 0,
      cycleCnt = 0;
    P.forEach(function (p) {
      var d1 = nodeDate(p, "线索对接"),
        d3 = nodeDate(p, "签约落地");
      if (d1 && d3) {
        var days = Math.round(
          (new Date(d3.replace(/-/g, "/")) - new Date(d1.replace(/-/g, "/"))) /
            86400000,
        );
        if (days > 0) {
          cycleSum += days;
          cycleCnt++;
        }
      }
    });
    var avgCycle = cycleCnt ? Math.round(cycleSum / cycleCnt) : "-";

    var PS = 6;
    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / PS));
    if (f.page > totalPages) f.page = totalPages;
    var pageData = list.slice((f.page - 1) * PS, f.page * PS);

    // 选项
    var stageOpts =
      '<option value="">全部阶段</option>' +
      STAGES.map(function (s) {
        return (
          '<option value="' +
          s.key +
          '"' +
          (f.stage === s.key ? " selected" : "") +
          ">" +
          s.name +
          "</option>"
        );
      }).join("");
    var districtOpts =
      '<option value="all">全部区县</option>' +
      M.DISTRICTS.map(function (d) {
        return (
          '<option value="' +
          d.key +
          '"' +
          (f.district === d.key ? " selected" : "") +
          ">" +
          d.name +
          "</option>"
        );
      }).join("");
    var owners = Array.from(
      new Set(
        P.map(function (p) {
          return p.owner;
        }),
      ),
    );
    var ownerOpts =
      '<option value="">全部责任单位</option>' +
      owners
        .map(function (o) {
          return (
            '<option value="' +
            o +
            '"' +
            (f.owner === o ? " selected" : "") +
            ">" +
            U.esc(o) +
            "</option>"
          );
        })
        .join("");

    // 阶段漏斗
    var funnelHtml = STAGES.map(function (s, i) {
      var cnt = stageStats[s.key];
      var pct = Math.round((cnt / P.length) * 100);
      return (
        '<div class="funnel-step" data-stage="' +
        s.key +
        '" style="cursor:pointer;">' +
        '<div class="fs-label">' +
        (i + 1) +
        ". " +
        s.name +
        "</div>" +
        '<div class="fs-bar" style="width:' +
        (30 + pct * 0.7) +
        '%">' +
        "<span>" +
        cnt +
        " 个</span>" +
        "</div>" +
        "</div>"
      );
    }).join("");

    // 项目卡片
    var cardsHtml = pageData
      .map(function (p) {
        var stageObj = STAGES.filter(function (s) {
          return s.key === p.stage;
        })[0];
        var curOrder = stageObj ? stageObj.order : 0;
        var stepsHtml = STAGES.map(function (s) {
          var cls =
            s.order < curOrder ? "done" : s.order === curOrder ? "active" : "";
          return (
            '<div class="ps-step ' +
            cls +
            '"><div class="ps-dot"></div><div class="ps-label">' +
            s.name +
            "</div></div>"
          );
        }).join("");

        var lastRec = (p.records && p.records[0]) || null;

        return (
          '<div class="proj-card" data-id="' +
          p.id +
          '"' +
          (p.id === state.highlightProjectId
            ? ' style="background:#EEF2FF;outline:2px solid #C7D2FE;outline-offset:-2px;"'
            : "") +
          ">" +
          '<div class="pc-head">' +
          '<div class="pc-name">' +
          U.esc(p.name) +
          "</div>" +
          '<span class="s-badge s-blue">' +
          U.esc(p.stageName) +
          "</span>" +
          "</div>" +
          '<div class="pc-enterprise">' +
          U.esc(p.enterpriseName) +
          "</div>" +
          '<div class="pc-tags">' +
          '<span class="tag">' +
          U.esc(p.districtName) +
          "</span>" +
          '<span class="tag">' +
          U.esc(p.owner) +
          "</span>" +
          "</div>" +
          '<div class="pc-meta">' +
          '<div><span class="muted">总投资</span> <b>' +
          U.esc(p.amount) +
          "</b></div>" +
          '<div><span class="muted">当前进度</span> <b>' +
          p.progress +
          "%</b></div>" +
          '<div><span class="muted">风险标签</span> <b style="color:' +
          (p.risk === "重大风险"
            ? "#e03131"
            : p.risk === "关注"
              ? "#F97316"
              : "#22C55E") +
          ';">' +
          U.esc(p.risk) +
          "</b></div>" +
          "</div>" +
          '<div class="pc-timeline">' +
          stepsHtml +
          "</div>" +
          '<div class="pc-footer">' +
          '<span class="muted">最近对接：' +
          U.esc(lastRec ? lastRec.date : "-") +
          "</span>" +
          '<button class="btn sm primary">查看详情</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    U.$("#content").innerHTML =
      // 顶部 KPI
      '<div class="kpi-grid">' +
      '<div class="kpi"><div class="k-label">项目总数</div><div class="k-value">' +
      P.length +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">总投资额</div><div class="k-value" style="color:#2563EB;">' +
      totalVal.toFixed(1) +
      '<span style="font-size:14px;">亿元</span></div></div>' +
      '<div class="kpi"><div class="k-label">签约落地</div><div class="k-value">' +
      stageStats["sign"] +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">建设推进</div><div class="k-value" style="color:#F97316;">' +
      stageStats["build"] +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">投产运营</div><div class="k-value" style="color:#22C55E;">' +
      stageStats["operate"] +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">达产评价</div><div class="k-value">' +
      stageStats["reach"] +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">本月对接</div><div class="k-value" style="color:#2563EB;">' +
      monthActive +
      '<span style="font-size:14px;">个</span></div></div>' +
      '<div class="kpi"><div class="k-label">平均落地周期</div><div class="k-value">' +
      avgCycle +
      '<span style="font-size:14px;">天</span></div></div>' +
      "</div>" +
      // 漏斗 + 趋势
      '<div class="row mt">' +
      '<div class="col card">' +
      '<div class="card-title">项目阶段漏斗</div>' +
      '<div class="funnel">' +
      funnelHtml +
      "</div>" +
      "</div>" +
      '<div class="col-2 card">' +
      '<div class="card-title">近 6 月项目落地趋势</div>' +
      '<div id="c_proj_trend" class="chart" style="height:260px"></div>' +
      "</div>" +
      "</div>" +
      // 项目清单（查询条件内嵌于卡片上部）
      '<div class="card mt" id="projListCard">' +
      '<div class="card-title">项目清单' +
      '<span style="margin-left:12px;">' +
      '<button class="btn sm primary" id="pjAdd">+ 新建项目</button> ' +
      '<button class="btn sm primary" id="pjAiRec">✦ AI 智能推荐</button> ' +
      '<button class="btn sm" id="pjExport">⬇ 导出报表</button>' +
      "</span>" +
      "</div>" +
      '<div style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px 16px;margin-bottom:4px;">' +
      '<div class="filter-row">' +
      '<div class="filter-item"><label>关键词</label>' +
      '<input type="text" class="f-input" id="pfKw" placeholder="项目名称/企业，回车筛选" value="' +
      U.esc(f.keyword) +
      '"/>' +
      "</div>" +
      '<div class="filter-item"><label>项目阶段</label>' +
      '<select class="f-select" id="pfStage">' +
      stageOpts +
      "</select>" +
      "</div>" +
      '<div class="filter-item"><label>所在区县</label>' +
      '<select class="f-select" id="pfDistrict">' +
      districtOpts +
      "</select>" +
      "</div>" +
      '<div class="filter-item"><label>责任单位</label>' +
      '<select class="f-select" id="pfOwner">' +
      ownerOpts +
      "</select>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="result-info" style="margin-bottom:8px;">共 <b>' +
      total +
      "</b> 个项目 · 第 " +
      f.page +
      "/" +
      totalPages +
      " 页</div>" +
      (total === 0
        ? C.emptyHtml("🏗️", "暂无符合条件的项目", "清除筛选")
        : '<div class="proj-grid">' +
          cardsHtml +
          "</div>" +
          C.paginationHtml(f.page, total, PS)) +
      "</div>";

    // 图表
    renderProjTrend();

    // 事件：下拉变更即筛选刷新；关键词逐字动态筛选（兼容中文输入法）
    ["pfStage", "pfDistrict", "pfOwner"].forEach(function (id) {
      U.$("#" + id).addEventListener("change", function () {
        kwState.active = false;
        applyFilter();
      });
    });
    var kwEl = U.$("#pfKw");
    if (kwEl) {
      var composing = false;
      kwEl.addEventListener("compositionstart", function () {
        composing = true;
      });
      kwEl.addEventListener("compositionend", function () {
        composing = false;
        kwState.active = true;
        kwState.pos = kwEl.value.length;
        applyFilter();
      });
      kwEl.addEventListener("input", function () {
        if (composing) return; // 输入法组词期间不刷新
        kwState.active = true;
        kwState.pos = kwEl.selectionStart;
        applyFilter();
      });
      kwEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") applyFilter();
      });
    }
    // 空态"清除筛选"按钮
    if (total === 0) {
      var clrBtn = document.querySelector(".empty-btn button");
      if (clrBtn)
        clrBtn.addEventListener("click", function () {
          kwState.active = false;
          f.keyword = "";
          f.stage = "";
          f.district = "all";
          f.owner = "";
          f.page = 1;
          APP.render();
        });
    }
    // AI 智能推荐按钮
    U.$("#pjAiRec").addEventListener("click", function () {
      var remaining = M.PROSPECT_ENTERPRISES.length - _recommendedCount;
      if (remaining <= 0) {
        C.confirm(
          {
            title: "AI 智能推荐",
            hideCancel: true,
            html:
              "当前候选企业已全部完成推荐。<br/><br/>系统候选池共 " +
              M.PROSPECT_ENTERPRISES.length +
              " 家目标企业，已全部纳入招商项目管理。",
          },
          function () {},
        );
        return;
      }
      openAiRecommendDialog();
    });
    U.$("#pjAdd").addEventListener("click", function () {
      APP.openProjectForm();
    });
    // 导出当前筛选下的全部项目（跨页）
    U.$("#pjExport").addEventListener("click", function () {
      C.exportCSV(
        "招商项目清单",
        [
          "编号",
          "项目名称",
          "关联企业",
          "阶段",
          "所在区县",
          "责任单位",
          "总投资(万元)",
          "进度(%)",
          "风险",
        ],
        list.map(function (p) {
          return [
            p.id,
            p.name,
            p.enterpriseName,
            p.stageName,
            p.districtName,
            p.owner,
            p.amountWan || "",
            p.progress,
            p.risk,
          ];
        }),
      );
      C.toast("已导出 " + list.length + " 个项目", "success");
    });

    // 漏斗点击筛选
    U.$$(".funnel-step").forEach(function (el) {
      el.addEventListener("click", function () {
        kwState.active = false;
        state.filter.project.stage = el.dataset.stage;
        state.filter.project.page = 1;
        APP.render();
      });
    });

    // 项目卡片点击
    U.$$(".proj-card").forEach(function (c) {
      c.addEventListener("click", function () {
        showProjectDetail(c.dataset.id);
      });
    });

    // 分页
    var pg = U.$(".pagination");
    if (pg)
      C.bindPagination(pg, function (p) {
        f.page = p;
        kwState.active = false;
        APP.render();
      });

    // 关键词输入中：恢复焦点与光标位置，保证连续输入不中断
    if (kwState.active) {
      var kwe = U.$("#pfKw");
      if (kwe) {
        kwe.focus();
        if (kwState.pos != null && kwe.setSelectionRange) {
          try {
            kwe.setSelectionRange(kwState.pos, kwState.pos);
          } catch (e) {}
        }
      }
    }

    // 从全局搜索 / 漏斗下钻 / 新建项目 跳转过来：把项目清单卡片滚到 content 顶部
    // highlightProjectId 同时控制单项目卡片高亮（新建、搜索跳转用）；scrollProjListToTop 只滚不高亮（漏斗下钻用）
    var needScroll = state.highlightProjectId || state.scrollProjListToTop;
    if (needScroll) {
      state.highlightProjectId = null;
      state.scrollProjListToTop = false;
      setTimeout(function () {
        setTimeout(function () {
          var contentEl = U.$("#content");
          var listCard = U.$("#projListCard");
          if (contentEl && listCard) {
            var cardRect = listCard.getBoundingClientRect();
            var contentRect = contentEl.getBoundingClientRect();
            // 顶部留 16px 间距，避免贴顶太紧
            contentEl.scrollTop += cardRect.top - contentRect.top - 16;
          }
        }, 0);
      }, 0);
    }
  }

  function renderProjTrend() {
    var months = M.MONTHS;
    var base = Math.ceil(M.PROJECTS.length / 12);
    var rng = U.makeRng(20260801);
    var newData = [],
      landData = [];
    for (var i = 0; i < 6; i++) {
      var n = Math.max(1, Math.round(base + (rng() - 0.4) * base));
      newData.push(n);
      landData.push(Math.max(1, Math.round(n * 0.6 + (rng() - 0.3) * 2)));
    }
    mkChart(U.$("#c_proj_trend"), {
      tooltip: { trigger: "axis" },
      legend: {
        data: ["新增项目", "落地项目"],
        top: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: { type: "category", data: months, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series: [
        {
          name: "新增项目",
          type: "bar",
          data: newData,
          itemStyle: { color: "#6366F1", borderRadius: [3, 3, 0, 0] },
          barWidth: 16,
        },
        {
          name: "落地项目",
          type: "line",
          smooth: true,
          data: landData,
          itemStyle: { color: "#22C55E" },
          areaStyle: { color: "rgba(34,197,94,0.15)" },
        },
      ],
    });
  }

  function showProjectDetail(id) {
    var p = null;
    for (var i = 0; i < M.PROJECTS.length; i++) {
      if (M.PROJECTS[i].id === id) {
        p = M.PROJECTS[i];
        break;
      }
    }
    if (!p) return;
    var stageObj = STAGES.filter(function (s) {
      return s.key === p.stage;
    })[0];
    var curOrder = stageObj ? stageObj.order : 0;
    var stepsHtml = STAGES.map(function (s) {
      var cls =
        s.order < curOrder ? "done" : s.order === curOrder ? "active" : "";
      return (
        '<div class="ps-step ' +
        cls +
        '" style="flex:1;"><div class="ps-dot"></div><div class="ps-label">' +
        s.name +
        "</div></div>"
      );
    }).join("");

    // 关键节点时间轴
    var tlHtml = (p.timeline || [])
      .map(function (t) {
        return (
          '<div class="tl-item"><div class="tl-date">' +
          U.esc(t.date) +
          "</div>" +
          '<span class="tl-type">' +
          U.esc(t.stage) +
          "</span>" +
          '<span class="tl-text">' +
          U.esc(t.note) +
          "</span></div>"
        );
      })
      .join("");

    // 对接记录（records: {date, person, content}）
    var recordsHtml = (p.records || [])
      .slice(0, 8)
      .map(function (r) {
        return (
          '<div class="tl-item"><div class="tl-date">' +
          U.esc(r.date) +
          "</div>" +
          '<span class="tl-type">' +
          U.esc(r.person || "") +
          "</span>" +
          '<span class="tl-text">' +
          U.esc(r.content || "") +
          "</span></div>"
        );
      })
      .join("");

    // 招商承诺（promises 为字符串清单）
    var promiseHtml = (p.promises || [])
      .map(function (s) {
        return (
          '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #E2E8F0;font-size:12px;color:#475569;">' +
          '<span style="color:#22C55E;font-weight:700;">✓</span><span>' +
          U.esc(s) +
          "</span></div>"
        );
      })
      .join("");

    var riskColor =
      p.risk === "重大风险"
        ? "#e03131"
        : p.risk === "关注"
          ? "#F97316"
          : "#22C55E";

    // 进展情况：历史阶段只读回显，当前阶段可编辑，未来阶段未开始
    var notes = p.stageNotes || {};
    var notesHead =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">进展情况' +
      (p.stageNoteTime
        ? '<span style="font-size:10px;color:#94A3B8;font-weight:400;">当前阶段最近更新：' +
          U.esc(p.stageNoteTime) +
          "</span>"
        : "") +
      "</div>";
    var notesBody = STAGES.map(function (s) {
      if (s.order < curOrder) {
        return (
          '<div style="padding:8px 10px;border-bottom:1px dashed #E2E8F0;">' +
          '<div style="font-size:12px;font-weight:600;color:#22C55E;margin-bottom:3px;">✓ ' +
          s.name +
          "</div>" +
          '<div style="font-size:12px;line-height:1.7;color:#64748B;background:#F8FAFC;padding:8px 10px;border-radius:4px;">' +
          U.esc(notes[s.key] || "（暂无进展记录）") +
          "</div></div>"
        );
      }
      if (s.order === curOrder) {
        return (
          '<div style="padding:8px 10px;border-left:3px solid #2563EB;background:#EFF6FF;border-radius:0 6px 6px 0;margin-top:6px;">' +
          '<div style="font-size:12px;font-weight:600;color:#2563EB;margin-bottom:5px;">✎ ' +
          s.name +
          " · 当前阶段（可编辑）</div>" +
          '<textarea id="snInput" style="width:100%;box-sizing:border-box;min-height:100px;padding:8px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;line-height:1.7;color:#334155;resize:vertical;font-family:inherit;background:#fff;" placeholder="记录本阶段推进情况、堵点问题与下步安排...">' +
          U.esc(notes[s.key] || "") +
          "</textarea>" +
          '<div style="text-align:right;margin-top:6px;"><button class="btn sm primary" id="snSave">保存进展情况</button></div></div>'
        );
      }
      return (
        '<div style="padding:8px 10px;border-bottom:1px dashed #E2E8F0;">' +
        '<div style="font-size:12px;font-weight:600;color:#CBD5E1;">· ' +
        s.name +
        "</div>" +
        '<div style="font-size:12px;color:#CBD5E1;margin-top:2px;">未开始</div></div>'
      );
    }).join("");

    var html =
      '<div style="font-size:13px;line-height:1.8;">' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:4px;">' +
      U.esc(p.name) +
      "</div>" +
      '<div style="color:#94A3B8;font-size:12px;margin-bottom:12px;">' +
      U.esc(p.enterpriseName) +
      " · " +
      U.esc(p.stageName) +
      " · 当前进度 " +
      p.progress +
      "%" +
      "</div>" +
      '<div class="progress" style="margin-bottom:12px;"><div class="bar" style="width:' +
      p.progress +
      '%;background:#2563EB;"></div></div>' +
      '<div class="dt-row"><span class="dt-k">项目编号</span><span class="dt-v">' +
      p.id +
      "</span></div>" +
      '<div class="dt-row"><span class="dt-k">所在区县</span><span class="dt-v">' +
      U.esc(p.districtName) +
      "</span></div>" +
      '<div class="dt-row"><span class="dt-k">总投资</span><span class="dt-v">' +
      U.esc(p.amount) +
      "</span></div>" +
      '<div class="dt-row"><span class="dt-k">责任单位</span><span class="dt-v">' +
      U.esc(p.owner) +
      "</span></div>" +
      '<div class="dt-row"><span class="dt-k">联系人</span><span class="dt-v">' +
      U.esc(p.contact || "-") +
      "</span></div>" +
      '<div class="dt-row"><span class="dt-k">风险标签</span><span class="dt-v" style="color:' +
      riskColor +
      ';font-weight:600;">' +
      U.esc(p.risk) +
      "</span></div>" +
      '<div style="margin-top:16px;">' +
      '<div style="font-weight:600;margin-bottom:8px;">项目进度</div>' +
      '<div class="pc-timeline" style="margin-bottom:12px;">' +
      stepsHtml +
      "</div>" +
      "</div>" +
      '<div style="margin-top:16px;">' +
      '<div style="font-weight:600;margin-bottom:6px;">' +
      notesHead +
      "</div>" +
      notesBody +
      "</div>" +
      '<div style="margin-top:16px;">' +
      '<div style="font-weight:600;margin-bottom:8px;">关键节点</div>' +
      '<div class="timeline">' +
      tlHtml +
      "</div>" +
      "</div>" +
      '<div style="margin-top:16px;">' +
      '<div style="font-weight:600;margin-bottom:4px;">招商承诺</div>' +
      promiseHtml +
      "</div>" +
      '<div style="margin-top:16px;">' +
      '<div style="font-weight:600;margin-bottom:8px;">对接记录</div>' +
      '<div class="timeline">' +
      recordsHtml +
      "</div>" +
      "</div>" +
      '<div style="margin-top:16px;display:flex;gap:8px;">' +
      '<button class="btn primary w-100" id="pjFollowBtn">＋ 跟进项目</button>' +
      '<button class="btn w-100" onclick="APP.viewEnterprise(\'' +
      p.enterprise +
      "')\">关联企业画像</button>" +
      '<button class="btn w-100" id="pjCloseBtn">关闭</button>' +
      "</div>" +
      "</div>";
    C.openDrawer({
      title: p.name,
      subtitle: "项目详情",
      bodyHtml: html,
      width: 620,
    });
    // 一键创建项目跟进任务 + 保存进展情况
    setTimeout(function () {
      // 保存当前阶段进展情况（不关抽屉、不重渲染，便于连续记录）
      var snSave = U.$("#snSave");
      if (snSave)
        snSave.addEventListener("click", function () {
          var ta = U.$("#snInput");
          if (!ta) return;
          p.stageNotes = p.stageNotes || {};
          p.stageNotes[p.stage] = ta.value.trim();
          p.stageNoteTime = U.fmtDateTime(new Date());
          C.toast("进展情况已保存", "success");
        });
      var btn = U.$("#pjFollowBtn");
      if (btn)
        btn.addEventListener("click", function () {
          APP.openTaskForm({
            projectId: p.id,
            entId: p.enterprise,
            type: "项目跟进",
            title: "【项目跟进】" + p.shortName + " 进度跟进",
          });
        });
      var closeBtn = U.$("#pjCloseBtn");
      if (closeBtn)
        closeBtn.addEventListener("click", function () {
          C.closeDrawer();
        });
    }, 0);
  }

  // ---------------- 新建项目 ----------------
  var FORM_OWNERS = [
    "招商一组",
    "招商二组",
    "招商三组",
    "产业招商科",
    "园区招商部",
  ];

  function fmtAmountWan(amt) {
    return amt >= 10000 ? (amt / 10000).toFixed(1) + "亿元" : amt + "万元";
  }

  // 新引进企业建档（轻量档案，同步进入企业名单；纯确定性构造，不消耗随机数流）
  function buildNewEnterprise(name, districtKey, indKey, amountWan) {
    var maxSeq = 0;
    M.ENTERPRISES.forEach(function (x) {
      var n = parseInt(String(x.id).replace(/\D/g, ""), 10);
      if (n > maxSeq) maxSeq = n;
    });
    var seq = maxSeq + 1;
    var dist = null,
      ind = null,
      i;
    for (i = 0; i < M.DISTRICTS.length; i++)
      if (M.DISTRICTS[i].key === districtKey) {
        dist = M.DISTRICTS[i];
        break;
      }
    if (!dist) dist = M.DISTRICTS[0];
    for (i = 0; i < M.INDUSTRIES.length; i++)
      if (M.INDUSTRIES[i].key === indKey) {
        ind = M.INDUSTRIES[i];
        break;
      }
    if (!ind) ind = M.INDUSTRIES[0];
    var amt = Math.round(amountWan) || 0;
    var scale =
      amt >= 50000 ? "大型企业" : amt >= 10000 ? "中型企业" : "小型企业";
    var now = new Date();
    var fd = function (x) {
      return x < 10 ? "0" + x : "" + x;
    };
    var todayStr =
      now.getFullYear() +
      "-" +
      fd(now.getMonth() + 1) +
      "-" +
      fd(now.getDate());
    var curYear = now.getFullYear();
    var monthsLen = Math.max(6, now.getMonth() + 1);
    function zeros(n) {
      var a = [];
      for (var zi = 0; zi < n; zi++) a.push(0);
      return a;
    }
    var regCapital = Math.round(amt * 0.25);
    return {
      id: "E" + (seq < 10 ? "00" : seq < 100 ? "0" : "") + seq,
      name: name,
      creditCode: "待补充（新引进建档）",
      legal: "",
      regCapital: regCapital,
      regCapitalFmt: fmtAmountWan(regCapital),
      found: todayStr,
      industry: ind.key,
      industryName: ind.name,
      scale: scale,
      tags: scale === "大型企业" ? ["新引进", "重点招商企业"] : ["新引进"],
      district: dist.key,
      districtName: dist.name,
      address: dist.name + "产业园区（待补充）",
      isDeep: false,
      signDaysAgo: 0,
      overview: {
        regCapital: fmtAmountWan(regCapital),
        revenue: "—",
        revenueWan: 0,
        tax: "—",
        taxWan: 0,
        employees: 0,
        invest: fmtAmountWan(amt),
        investWan: amt,
        profit: "—",
        yearly: {
          years: [curYear - 4, curYear - 3, curYear - 2, curYear - 1, curYear],
          revenueWan: zeros(5),
          taxWan: zeros(5),
          employees: zeros(5),
          investWan: zeros(5),
        },
      },
      status: { biz: "正常", credit: "正常", performRate: 0 },
      operation: {
        revenue: zeros(monthsLen),
        tax: zeros(monthsLen),
        invest: zeros(monthsLen),
        employees: zeros(monthsLen),
      },
      commitments: [],
      dynamics: [
        {
          date: todayStr,
          type: "招商",
          text: "新引进企业建档，「" + name + "」进入线索对接阶段。",
        },
      ],
      risks: {
        operation: 0,
        finance: 0,
        judicial: 0,
        credit: 0,
        tender: 0,
        tax: 0,
        perform: 0,
        ip: 0,
      },
      riskScore: 0,
      riskLevel: "blue",
      shareholders: [],
      policies: [],
      ai: null,
    };
  }

  // 创建项目并置顶展示；新引进企业同步写入企业名单
  // d = { name, entName, district, industry, amountWan, owner, contact, note }
  APP.createProject = function (d) {
    var entName = (d.entName || "").trim();
    if (!entName) return null;
    // 仅允许企业名单中不存在的新企业
    for (var i = 0; i < M.ENTERPRISES.length; i++) {
      if (M.ENTERPRISES[i].name === entName) return null;
    }
    var ent = buildNewEnterprise(entName, d.district, d.industry, d.amountWan);
    M.ENTERPRISES.push(ent);
    var maxSeq = 0;
    M.PROJECTS.forEach(function (x) {
      var n = parseInt(String(x.id).replace(/\D/g, ""), 10);
      if (n > maxSeq) maxSeq = n;
    });
    var seq = maxSeq + 1;
    var amt = Math.round(d.amountWan);
    var today = new Date();
    var fd = function (x) {
      return x < 10 ? "0" + x : "" + x;
    };
    var todayStr =
      today.getFullYear() +
      "-" +
      fd(today.getMonth() + 1) +
      "-" +
      fd(today.getDate());
    var promises = [
      "实际投资 " + fmtAmountWan(amt),
      "年产值 " + fmtAmountWan(Math.round(amt * 0.6)),
      "年纳税 " + fmtAmountWan(Math.round(amt * 0.05)),
      "就业 " + Math.max(50, Math.round(amt / 150)) + " 人",
    ];
    var p = {
      id: "P" + (seq < 10 ? "0" : "") + seq,
      name: d.name || entName + "项目",
      shortName: entName,
      enterprise: ent.id,
      enterpriseName: entName,
      stage: "lead",
      stageName: "线索对接",
      amount: amt >= 10000 ? (amt / 10000).toFixed(1) + "亿" : amt + "万",
      amountWan: amt,
      owner: d.owner || FORM_OWNERS[0],
      contact: d.contact || "",
      progress: 5,
      risk: "正常",
      riskLevel: ent.riskLevel,
      district: ent.district,
      districtName: ent.districtName,
      timeline: [
        {
          date: todayStr,
          stage: "线索对接",
          note: entName + "项目线索对接阶段启动",
        },
      ],
      records: [
        {
          date: todayStr,
          person: (d.contact || "专班").split(" ")[0],
          content: "项目建档，开始线索对接。",
        },
      ],
      promises: promises,
      stageNotes: { lead: d.note || "" },
    };
    M.PROJECTS.unshift(p);
    return p;
  };

  // 新建项目表单（抽屉）：招商引进的是新企业——手动录入名称并实时查重
  APP.openProjectForm = function () {
    var defDistrict =
      state.district && state.district !== "all"
        ? state.district
        : M.DISTRICTS[0].key;
    var districtOpts = M.DISTRICTS.map(function (d) {
      return (
        '<option value="' +
        d.key +
        '"' +
        (d.key === defDistrict ? " selected" : "") +
        ">" +
        d.name +
        "</option>"
      );
    }).join("");
    var indOpts = M.INDUSTRIES.map(function (d) {
      return '<option value="' + d.key + '">' + U.esc(d.name) + "</option>";
    }).join("");
    var ownerOpts = FORM_OWNERS.map(function (o) {
      return '<option value="' + o + '">' + o + "</option>";
    }).join("");

    var html =
      '<div style="font-size:13px;">' +
      '<div class="dt-row"><span class="dt-k">项目名称</span></div>' +
      '<input type="text" class="f-input" id="pnfName" style="width:100%;margin-bottom:12px;" placeholder="留空则按「企业名+项目」自动生成"/>' +
      '<div class="dt-row"><span class="dt-k" style="width:auto;padding-right:10px;">新引进企业名称 <span style="color:#e03131;">*</span></span></div>' +
      '<input type="text" class="f-input" id="pnfEntName" style="width:100%;" placeholder="输入拟引进企业全称（须为企业名单中不存在的新企业）"/>' +
      '<div id="pnfDupTip" style="display:none;color:#e03131;font-size:12px;margin-top:4px;">⚠ 该企业已存在于企业名单，无法重复建档</div>' +
      '<div style="height:10px;"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
      '<div><div class="dt-row"><span class="dt-k" style="width:auto;padding-right:10px;">投资总额（万元）<span style="color:#e03131;">*</span></span></div>' +
      '<input type="number" class="f-input" id="pnfAmt" style="width:100%;" placeholder="如 12000" min="1"/></div>' +
      '<div><div class="dt-row"><span class="dt-k">责任单位</span></div>' +
      '<select class="f-select" id="pnfOwner" style="width:100%;">' +
      ownerOpts +
      "</select></div>" +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
      '<div><div class="dt-row"><span class="dt-k">所在区县</span></div>' +
      '<select class="f-select" id="pnfDistrictSel" style="width:100%;">' +
      districtOpts +
      "</select></div>" +
      '<div><div class="dt-row"><span class="dt-k">所属行业</span></div>' +
      '<select class="f-select" id="pnfIndustry" style="width:100%;">' +
      indOpts +
      "</select></div>" +
      "</div>" +
      '<div class="dt-row"><span class="dt-k">联系人</span></div>' +
      '<input type="text" class="f-input" id="pnfContact" style="width:100%;margin-bottom:12px;" placeholder="姓名 手机号（选填）"/>' +
      '<div class="dt-row"><span class="dt-k">初始阶段</span><span class="dt-v">线索对接</span></div>' +
      '<div class="dt-row" style="margin-top:8px;"><span class="dt-k" style="width:auto;padding-right:10px;">线索对接 · 进展情况</span></div>' +
      '<textarea id="pnfNote" style="width:100%;box-sizing:border-box;min-height:110px;padding:8px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;line-height:1.7;color:#334155;resize:vertical;font-family:inherit;background:#fff;margin-bottom:14px;" placeholder="记录本轮对接情况、企业意向要点与下步安排..."></textarea>' +
      '<div style="display:flex;gap:8px;">' +
      '<button class="btn primary w-100" id="pnfSave">创建项目</button>' +
      '<button class="btn w-100" onclick="APP.Components.closeDrawer()">取消</button>' +
      "</div>" +
      "</div>";
    C.openDrawer({
      title: "新建项目",
      subtitle: "招商引进新企业 · 初始阶段：线索对接",
      bodyHtml: html,
      width: 560,
    });

    setTimeout(function () {
      var entInput = U.$("#pnfEntName");
      if (!entInput) return;
      function findDup() {
        var v = entInput.value.trim();
        if (!v) return null;
        for (var i = 0; i < M.ENTERPRISES.length; i++) {
          if (M.ENTERPRISES[i].name === v) return M.ENTERPRISES[i];
        }
        return null;
      }
      // 输入即查重：已存在则内联提示；同步预览自动项目名
      entInput.addEventListener("input", function () {
        var tip = U.$("#pnfDupTip");
        var nameEl = U.$("#pnfName");
        var v = entInput.value.trim();
        if (nameEl && !nameEl.value.trim()) {
          nameEl.placeholder = v
            ? "留空则自动生成：「" + v + "项目」"
            : "留空则按「企业名+项目」自动生成";
        }
        if (tip) tip.style.display = findDup() ? "block" : "none";
      });
      U.$("#pnfSave").addEventListener("click", function () {
        var entName = entInput.value.trim();
        if (!entName) {
          C.toast("请输入新引进企业名称", "warning");
          return;
        }
        if (findDup()) {
          C.toast(
            "「" + entName + "」已存在于企业名单，无法重复建档",
            "warning",
          );
          return;
        }
        var amtRaw = U.$("#pnfAmt").value;
        var amt = parseFloat(amtRaw);
        if (!amt || amt <= 0) {
          C.toast("请填写有效的投资总额", "warning");
          return;
        }
        var p = APP.createProject({
          name: U.$("#pnfName").value.trim(),
          entName: entName,
          district: U.$("#pnfDistrictSel").value,
          industry: U.$("#pnfIndustry").value,
          amountWan: amt,
          owner: U.$("#pnfOwner").value,
          contact: U.$("#pnfContact").value.trim(),
          note: U.$("#pnfNote").value.trim(),
        });
        if (!p) {
          C.toast("创建失败：企业名称校验未通过", "warning");
          return;
        }
        C.closeDrawer();
        C.toast(
          "项目已创建，新引进企业「" + entName + "」已同步入企业名单",
          "success",
        );
        // 清除筛选回到第一页，一次性高亮新项目卡片
        var f = state.filter.project;
        f.keyword = "";
        f.stage = "";
        f.district = "all";
        f.owner = "";
        f.page = 1;
        state.highlightProjectId = p.id;
        APP.render();
      });
    }, 0);
  };

  function applyFilter() {
    var f = state.filter.project;
    f.keyword = U.$("#pfKw").value.trim();
    f.stage = U.$("#pfStage").value;
    f.district = U.$("#pfDistrict").value;
    f.owner = U.$("#pfOwner").value;
    f.page = 1;
    APP.render();
  }

  // ============================================================
  // AI 智能推荐招商项目（模拟大模型多维度匹配）
  // ============================================================
  function openAiRecommendDialog() {
    // 待推荐的候选企业（按顺序取 3-5 家未推荐过的）
    var remaining = M.PROSPECT_ENTERPRISES.slice(_recommendedCount);
    var recCount = Math.min(
      remaining.length,
      3 + Math.floor(Math.random() * 3),
    );
    var candidates = remaining.slice(0, recCount);

    // 为每家候选企业生成 AI 评分和推荐理由
    function scoreProspect(p) {
      var score = 0;
      var reasons = [];
      // 投资强度（权重30%）
      if (p.investWan >= 150000) {
        score += 28;
        reasons.push("投资规模超15亿元，重大产业项目");
      } else if (p.investWan >= 80000) {
        score += 24;
        reasons.push("投资规模较大，产业链带动效应强");
      } else if (p.investWan >= 30000) {
        score += 20;
        reasons.push("投资规模达标，符合市级招商标准");
      } else {
        score += 15;
        reasons.push("投资规模适中，属于成长型项目");
      }
      // 产业契合度（权重25%）
      var mainIndustries = [
        "新能源",
        "数据要素",
        "生物医药",
        "数字经济",
        "装备制造",
      ];
      if (mainIndustries.indexOf(p.industry) >= 0) {
        score += 24;
        reasons.push(p.industry + "产业与庆阳市重点招商方向高度契合");
      } else {
        score += 16;
        reasons.push(p.industry + "产业可填补区域产业链空白");
      }
      // 企业实力（权重20%）
      if (p.scale === "大型企业") {
        score += 19;
        reasons.push("大型企业/行业龙头，抗风险能力强");
      } else if (p.scale === "中型企业") {
        score += 15;
        reasons.push("中型企业，成长潜力大");
      } else {
        score += 10;
        reasons.push("中小企业，需关注成长速度");
      }
      // 就业带动（权重15%）
      if (p.employees >= 2000) {
        score += 14;
        reasons.push("预计带动就业2000人以上，社会效益显著");
      } else if (p.employees >= 1000) {
        score += 12;
        reasons.push("就业带动能力强");
      } else if (p.employees >= 500) {
        score += 10;
        reasons.push("就业规模达标");
      } else {
        score += 7;
        reasons.push("就业带动有限");
      }
      // 税收贡献（权重10%）
      var taxWan = parseInt(String(p.tax || "0").replace(/\D/g, ""), 10) || 0;
      if (taxWan >= 10000) {
        score += 9;
        reasons.push("年纳税超亿元，财政贡献突出");
      } else if (taxWan >= 5000) {
        score += 8;
        reasons.push("税收贡献较大");
      } else if (taxWan >= 1000) {
        score += 6;
        reasons.push("税收贡献稳定");
      } else {
        score += 4;
        reasons.push("税收贡献一般");
      }
      // 微调
      score += Math.floor(Math.random() * 5) - 2;
      score = Math.max(65, Math.min(98, score));
      return {
        prospect: p,
        score: score,
        reasons: reasons.slice(0, 4),
        industry: p.industry,
      };
    }

    var recommendations = candidates.map(function (p) {
      return scoreProspect(p);
    });
    recommendations.sort(function (a, b) {
      return b.score - a.score;
    });

    // 构建对话框
    var mask = U.el("div", { class: "modal-mask", style: "z-index:2000;" });
    var box = U.el(
      "div",
      {
        class: "modal",
        style:
          "width:760px;max-height:80vh;display:flex;flex-direction:column;",
      },
      [
        U.el("div", {
          class: "modal-header",
          html: '✦ AI 招商项目智能推荐 <span style="font-size:12px;font-weight:400;color:#94A3B8;margin-left:8px;">基于庆阳市产业政策与企业画像的智能匹配引擎</span>',
        }),
        U.el("div", {
          class: "modal-body",
          style: "flex:1;overflow-y:auto;",
          html:
            '<div id="aiRecContent" style="font-size:13px;line-height:1.8;">' +
            '<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin-bottom:16px;">' +
            '<div style="font-weight:600;color:#0369A1;margin-bottom:8px;">🧠 AI 推荐引擎运行中...</div>' +
            '<div id="aiRecThinking" style="color:#475569;font-size:12px;min-height:140px;white-space:pre-line;">正在加载庆阳市产业政策知识库与候选企业画像...</div>' +
            "</div>" +
            '<div id="aiRecResults" style="display:none;"></div>' +
            "</div>",
        }),
        U.el("div", {
          class: "modal-footer",
          html:
            '<button class="btn" id="aiRecCloseBtn" style="display:none;">关闭</button>' +
            '<button class="btn primary" id="aiRecApplyBtn" style="display:none;">确认纳入招商项目</button>',
        }),
      ],
    );
    mask.appendChild(box);
    document.body.appendChild(mask);

    var thinkingEl = box.querySelector("#aiRecThinking");
    var resultsEl = box.querySelector("#aiRecResults");
    var closeBtn = box.querySelector("#aiRecCloseBtn");
    var applyBtn = box.querySelector("#aiRecApplyBtn");

    function closeDialog() {
      mask.style.opacity = "0";
      setTimeout(function () {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 200);
    }
    closeBtn.addEventListener("click", closeDialog);

    // 模拟大模型思考过程（流式输出）
    var thinkingSteps = [
      { text: "📚 步骤 1/6：加载庆阳市招商引资政策知识库...", delay: 500 },
      {
        text: "   → 加载产业发展规划、土地政策、财税政策、人才政策等 12 项政策文件",
        delay: 700,
      },
      { text: "🏭 步骤 2/6：扫描外部候选企业画像...", delay: 400 },
      {
        text:
          "   → 共检索 " +
          M.PROSPECT_ENTERPRISES.length +
          " 家目标企业的投资意向与产业标签",
        delay: 600,
      },
      { text: "🗺️ 步骤 3/6：产业图谱匹配分析...", delay: 500 },
      {
        text: "   → 匹配维度：新能源/数据要素/生物医药/数字经济/装备制造/现代农业",
        delay: 800,
      },
      { text: "⚖️ 步骤 4/6：多维度综合评分...", delay: 500 },
      {
        text: "   → 权重分配：投资强度30% · 产业契合度25% · 企业实力20% · 就业带动15% · 税收贡献10%",
        delay: 900,
      },
      { text: "🔍 步骤 5/6：去重与风险初筛...", delay: 400 },
      {
        text: "   → 排除已在库企业，筛除高风险失信主体，校验产业政策符合性",
        delay: 700,
      },
      { text: "🎯 步骤 6/6：生成推荐清单...", delay: 300 },
      {
        text:
          "   → 按推荐优先级排序，输出 Top " +
          recommendations.length +
          " 优质招商线索",
        delay: 600,
      },
    ];

    var stepIdx = 0;
    function runStep() {
      if (stepIdx >= thinkingSteps.length) {
        showResults();
        return;
      }
      var step = thinkingSteps[stepIdx];
      thinkingEl.textContent += "\n" + step.text;
      var parent = thinkingEl.parentElement;
      parent.scrollTop = parent.scrollHeight;
      stepIdx++;
      setTimeout(runStep, step.delay + Math.random() * 300);
    }

    function showResults() {
      thinkingEl.innerHTML +=
        '\n\n<span style="color:#16A34A;">✓ 推荐完成，共筛选出 ' +
        recommendations.length +
        " 家优质目标企业</span>";

      // 结果表格
      var resultsHtml = "";
      recommendations.forEach(function (r, ri) {
        var scoreColor =
          r.score >= 90 ? "#16A34A" : r.score >= 80 ? "#2563EB" : "#F97316";
        resultsHtml +=
          '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<div style="font-weight:600;color:#0F172A;font-size:14px;">🏢 ' +
          U.esc(r.prospect.name) +
          "</div>" +
          '<div style="text-align:right;">' +
          '<span style="font-weight:700;font-size:18px;color:' +
          scoreColor +
          ';">' +
          r.score +
          "</span>" +
          '<span style="font-size:11px;color:#94A3B8;"> 分</span>' +
          "</div>" +
          "</div>" +
          '<div style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">' +
          '<div><span style="color:#94A3B8;">所属行业：</span>' +
          U.esc(r.industry) +
          "</div>" +
          '<div><span style="color:#94A3B8;">企业规模：</span>' +
          U.esc(r.prospect.scale) +
          "</div>" +
          '<div><span style="color:#94A3B8;">意向投资：</span>' +
          U.esc(
            r.prospect.investWan >= 10000
              ? (r.prospect.investWan / 10000).toFixed(0) + "亿元"
              : r.prospect.investWan + "万元",
          ) +
          "</div>" +
          '<div><span style="color:#94A3B8;">预计就业：</span>' +
          r.prospect.employees.toLocaleString() +
          " 人</div>" +
          '<div><span style="color:#94A3B8;">年税收：</span>' +
          U.esc(r.prospect.tax) +
          "</div>" +
          '<div><span style="color:#94A3B8;">来源渠道：</span>' +
          U.esc(r.prospect.source) +
          "</div>" +
          "</div>" +
          '<div style="font-size:12px;color:#475569;line-height:1.8;">' +
          '<div style="font-weight:600;color:#0F172A;margin-bottom:4px;">推荐理由：</div>' +
          r.reasons
            .map(function (re) {
              return "· " + re;
            })
            .join("<br/>") +
          "</div>" +
          '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--c-border-light);font-size:11px;color:#94A3B8;">' +
          "💡 " +
          U.esc(r.prospect.strength) +
          "</div>" +
          "</div>" +
          "</div>";
      });

      // 总体统计
      var totalInv = recommendations.reduce(function (s, r) {
        return s + r.prospect.investWan;
      }, 0);
      var totalEmp = recommendations.reduce(function (s, r) {
        return s + r.prospect.employees;
      }, 0);
      resultsHtml +=
        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;margin-bottom:8px;">' +
        '<div style="font-weight:600;color:#15803D;margin-bottom:6px;">📊 推荐概览</div>' +
        '<div style="font-size:12px;color:#475569;line-height:2;">' +
        "本次推荐 <b>" +
        recommendations.length +
        "</b> 家优质目标企业<br/>" +
        "意向总投资 <b>" +
        (totalInv >= 10000
          ? (totalInv / 10000).toFixed(1) + "亿元"
          : totalInv + "万元") +
        "</b><br/>" +
        "预计带动就业 <b>" +
        totalEmp.toLocaleString() +
        "</b> 人<br/>" +
        '平均推荐评分 <b style="color:#16A34A;">' +
        Math.round(
          recommendations.reduce(function (s, r) {
            return s + r.score;
          }, 0) / recommendations.length,
        ) +
        "</b> 分<br/>" +
        "置信度 <b>91%</b> · 模型版本 deepseek-v4-pro" +
        "</div>" +
        "</div>";

      resultsEl.innerHTML = resultsHtml;
      resultsEl.style.display = "";

      // 滚动到底部
      var bodyEl = box.querySelector(".modal-body");
      if (bodyEl) {
        setTimeout(function () {
          bodyEl.scrollTop = bodyEl.scrollHeight;
        }, 50);
      }

      closeBtn.style.display = "";
      applyBtn.style.display = "";
    }

    // 确认纳入：将推荐企业转为招商项目（线索对接阶段），同时加入企业库
    applyBtn.addEventListener("click", function () {
      var today = new Date();
      var fd = function (x) {
        return x < 10 ? "0" + x : "" + x;
      };
      var todayStr =
        today.getFullYear() +
        "-" +
        fd(today.getMonth() + 1) +
        "-" +
        fd(today.getDate());

      var maxProjSeq = 0;
      M.PROJECTS.forEach(function (p) {
        var n = parseInt(String(p.id || "").replace(/\D/g, ""), 10);
        if (n > maxProjSeq) maxProjSeq = n;
      });

      recommendations.forEach(function (r, idx) {
        var p = r.prospect;
        // 1. 加入企业库（轻量档案）
        var newEnt = buildNewEnterprise(
          p.name,
          p.district,
          p.industry,
          p.investWan,
        );
        // 补充更多信息
        newEnt.overview.employees = p.employees;
        newEnt.overview.revenue = p.revenue;
        newEnt.overview.tax = p.tax;
        newEnt.tags = p.tags || [];
        newEnt.scale = p.scale;
        // 移到企业列表最前面（最新加入的排前面）
        var entIdx = M.ENTERPRISES.indexOf(newEnt);
        if (entIdx > 0) {
          M.ENTERPRISES.splice(entIdx, 1);
          M.ENTERPRISES.unshift(newEnt);
        }

        // 2. 创建招商项目（线索对接阶段）
        maxProjSeq++;
        var projId = "P" + String(maxProjSeq).padStart(2, "0");
        var amountWan = p.investWan;
        var amountStr =
          amountWan >= 10000
            ? (amountWan / 10000).toFixed(0) + "亿"
            : amountWan + "万";
        var newProject = {
          id: projId,
          name: p.name + "项目",
          shortName: p.name,
          enterprise: newEnt.id,
          enterpriseName: p.name,
          stage: "lead",
          stageName: "线索对接",
          amount: amountStr,
          amountWan: amountWan,
          owner: "招商一组",
          contact: p.contact,
          progress: 8 + Math.floor(Math.random() * 6),
          risk: "正常",
          riskLevel: "blue",
          district: p.district,
          districtName: p.districtName,
          timeline: [
            {
              date: todayStr,
              stage: "线索对接",
              note: p.name + "项目线索对接阶段启动（AI智能推荐）",
            },
          ],
          records: [
            {
              date: todayStr,
              person: "系统",
              content:
                "AI 智能推荐引擎自动识别并纳入招商线索库，推荐评分：" +
                r.score +
                " 分。",
            },
          ],
          promises: [
            "投资 " + amountStr + "元",
            "就业 " + p.employees.toLocaleString() + " 人",
            "达产营收 " + p.revenue,
            "税收 " + p.tax,
          ],
          source: "AI智能推荐",
        };
        M.PROJECTS.unshift(newProject);
      });

      _recommendedCount += recommendations.length;
      closeDialog();
      // 重置筛选到第1页，显示全部（方便看到新项目）
      state.filter.project.keyword = "";
      state.filter.project.stage = "";
      state.filter.project.page = 1;
      APP.render();
      C.toast(
        "已将 " +
          recommendations.length +
          " 家推荐企业纳入招商项目（线索对接阶段）",
        "success",
      );
    });

    // 启动思考过程
    setTimeout(runStep, 400);
  }

  APP.registerRenderer("project", renderProject);
})();
