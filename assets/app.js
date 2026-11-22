(function () {
  "use strict";

  var CONFIG = window.SITE_CONFIG || {};

  var META = {
    daily: { en: "DAILY", desc: "質問への回答、文章作成、相談ごとなど、ふだんの会話全般での強さ。" },
    work: { en: "BUSINESS", desc: "PDFや資料を読み取って、要約・抜き出し・分析する力。仕事の書類まわりの強さ。" },
    code: { en: "CODING", desc: "Webサイトやアプリを作る力。複数の手順を自分で進めるコーディング作業も含みます。" },
    video: { en: "VIDEO", desc: "文章の指示から動画を作る力。映像のきれいさや指示どおりに作れるかで比べています。" }
  };
  var MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  var BADGES = { 1: "CHAMPION", 2: "2ND", 3: "3RD" };

  var state = { data: null, comments: {}, current: null };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtNum(n) { return Number(n).toLocaleString("ja-JP"); }

  // "2026-11-18" -> "2026年11月18日"
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日" : "—";
  }

  // ISO 文字列を日本時間の部品に
  function jstParts(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    var j = new Date(d.getTime() + 9 * 3600 * 1000);
    return {
      y: j.getUTCFullYear(), mo: j.getUTCMonth() + 1, d: j.getUTCDate(),
      h: j.getUTCHours(), mi: j.getUTCMinutes()
    };
  }

  function fmtFetched(iso) {
    var p = jstParts(iso);
    if (!p) return "—";
    return p.y + "年" + p.mo + "月" + p.d + "日 " + p.h + ":" + String(p.mi).padStart(2, "0") + "（日本時間）";
  }

  function commentHtml(name) {
    var c = state.comments[name];
    return c ? '<p class="comment">' + esc(c) + "</p>" : "";
  }

  function renderTabs() {
    var html = state.data.categories.map(function (c) {
      var m = META[c.key] || { en: c.key.toUpperCase() };
      return '<button type="button" class="tab" data-key="' + esc(c.key) + '" aria-pressed="false">' +
        '<span class="en">' + esc(m.en) + "</span>" +
        '<span class="ja">' + esc(c.label) + "</span></button>";
    }).join("");
    var tabs = $("tabs");
    tabs.innerHTML = html;
    tabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      if (location.hash !== "#" + key) history.replaceState(null, "", "#" + key);
      select(key);
    });
  }

  function renderBoard(cat) {
    var meta = META[cat.key] || {};
    var models = cat.models || [];
    var top = models.length ? models[0].score : 1;

    var podium = models.slice(0, 3).map(function (m) {
      var r = m.rank;
      return '<div class="pod r' + r + '">' +
        '<span class="badge">' + BADGES[r] + "</span>" +
        '<div class="num">' + r + "</div>" +
        '<div class="name">' + esc(m.name) + "</div>" +
        '<div class="org">' + esc(m.org) + "</div>" +
        '<div class="score">' + fmtNum(m.score) + "<small>pt</small></div>" +
        commentHtml(m.name) +
        "</div>";
    }).join("");

    var rows = models.slice(3, 8).map(function (m) {
      var pct = Math.max(2, Math.min(100, (m.score / top) * 100));
      return '<li class="row">' +
        '<span class="rk">' + m.rank + "</span>" +
        '<span class="name">' + esc(m.name) + "</span>" +
        '<span class="org">' + esc(m.org) + "</span>" +
        '<span class="bar" role="img" aria-label="1位を100としたとき ' + pct.toFixed(1) + '"><span style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="score">' + fmtNum(m.score) + "</span>" +
        commentHtml(m.name) +
        "</li>";
    }).join("");

    $("board").innerHTML =
      '<div class="board-head">' +
        "<div><h2>" + esc(cat.label) + "部門</h2>" +
        '<p class="desc">' + esc(meta.desc || "") + "</p></div>" +
        '<div class="board-meta"><p>元データ：Arena『' + esc(cat.board) + "』</p>" +
        "<p>" + fmtDate(cat.published) + "時点のデータ</p></div>" +
      "</div>" +
      '<div class="podium">' + podium + "</div>" +
      (rows ? '<ol class="list" start="4">' + rows + "</ol>" : "");
  }

  function renderComments(cat) {
    var items = (cat.models || []).filter(function (m) { return state.comments[m.name]; });
    $("comments").innerHTML = items.length
      ? "<dl>" + items.map(function (m) {
          return "<dt>" + m.rank + "位 " + esc(m.name) + "</dt><dd>" + esc(state.comments[m.name]) + "</dd>";
        }).join("") + "</dl>"
      : '<p class="muted">準備中</p>';
  }

  function select(key) {
    var cats = state.data.categories;
    var cat = cats.filter(function (c) { return c.key === key; })[0] || cats[0];
    state.current = cat.key;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-key") === cat.key ? "true" : "false");
    });
    renderBoard(cat);
    renderComments(cat);
  }

  function renderStatic() {
    var p = jstParts(state.data.fetched_at);
    if (p) $("season").textContent = "SEASON " + p.y + " · " + MONTHS[p.mo - 1];
    $("fetched-at").textContent = fmtFetched(state.data.fetched_at);
    if (CONFIG.updateSchedule) $("schedule").textContent = CONFIG.updateSchedule;
    if (CONFIG.sourceUrl) $("source-link").href = CONFIG.sourceUrl;
    var op = $("operator");
    if (CONFIG.operatorUrl) op.href = CONFIG.operatorUrl;
    if (CONFIG.operatorName) op.textContent = CONFIG.operatorName;
  }

  function getJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  Promise.all([
    getJson("data/rankings.json"),
    getJson("data/comments.json").catch(function () { return {}; })
  ]).then(function (res) {
    state.data = res[0];
    state.comments = res[1] || {};
    renderStatic();
    renderTabs();
    select(location.hash.slice(1));
    window.addEventListener("hashchange", function () { select(location.hash.slice(1)); });
  }).catch(function () {
    $("board").innerHTML = '<p class="loading">データを読み込めませんでした。時間をおいて再読み込みしてください。</p>';
  });
})();
