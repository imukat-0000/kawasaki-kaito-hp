(function(){
  "use strict";

  var slots = {};
  var toggleBtn, panel, panelCount, panelList, exportBtn;
  var pan = null;
  var justPanned = false;

  function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }

  function escapeHtml(str){
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function repoRelative(p){ return (p || "").replace(/^\.\.\//, ""); }

  function isDirty(s){
    return s.isNew ||
      Math.round(s.posX) !== Math.round(s.origPosX) ||
      Math.round(s.posY) !== Math.round(s.origPosY) ||
      Math.abs(s.zoom - s.origZoom) > 0.01;
  }

  function applyVisual(s){
    if (!s.imgEl) return;
    s.imgEl.style.objectPosition = Math.round(s.posX) + "% " + Math.round(s.posY) + "%";
    s.imgEl.style.setProperty("--zoom", s.zoom.toFixed(2));
  }

  function ensureImg(s){
    if (s.imgEl) return s.imgEl;
    var img = document.createElement("img");
    img.alt = s.label || "";
    img.loading = "lazy";
    var kanjiEl = s.el.querySelector(".kanji");
    if (kanjiEl) kanjiEl.remove();
    s.el.appendChild(img);
    s.imgEl = img;
    return img;
  }

  function handleFile(s, file){
    if (!/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function(e){
      s.isNew = true;
      s.file = file;
      s.posX = 50; s.posY = 50; s.zoom = 1;
      var img = ensureImg(s);
      img.src = e.target.result;
      applyVisual(s);
      updatePanel();
    };
    reader.readAsDataURL(file);
  }

  function startPan(s, clientX, clientY){
    var rect = s.el.getBoundingClientRect();
    pan = { s: s, startX: clientX, startY: clientY, rect: rect, posX: s.posX, posY: s.posY, moved: false };
    s.el.classList.add("kk-panning");
  }

  function movePan(clientX, clientY){
    if (!pan) return;
    var dx = clientX - pan.startX, dy = clientY - pan.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pan.moved = true;
    pan.s.posX = clamp(pan.posX - (dx / pan.rect.width) * 100, 0, 100);
    pan.s.posY = clamp(pan.posY - (dy / pan.rect.height) * 100, 0, 100);
    applyVisual(pan.s);
  }

  function endPan(){
    if (!pan) return;
    pan.s.el.classList.remove("kk-panning");
    justPanned = pan.moved;
    updatePanel();
    pan = null;
  }

  function wireSlot(s){
    var el = s.el;

    el.addEventListener("dragover", function(e){
      if (!document.body.classList.contains("kk-edit-mode")) return;
      e.preventDefault();
      el.classList.add("kk-dragover");
    });
    el.addEventListener("dragleave", function(){ el.classList.remove("kk-dragover"); });
    el.addEventListener("drop", function(e){
      if (!document.body.classList.contains("kk-edit-mode")) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("kk-dragover");
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(s, file);
    });

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "kk-edit-file-input";
    fileInput.addEventListener("click", function(e){ e.stopPropagation(); });
    fileInput.addEventListener("change", function(){
      if (fileInput.files && fileInput.files[0]) handleFile(s, fileInput.files[0]);
      fileInput.value = "";
    });
    el.appendChild(fileInput);

    el.addEventListener("click", function(e){
      if (!document.body.classList.contains("kk-edit-mode")) return;
      e.preventDefault();
      e.stopPropagation();
      if (justPanned){ justPanned = false; return; }
      if (e.target === fileInput || e.target.closest(".kk-edit-zoom")) return;
      fileInput.click();
    });

    el.addEventListener("mousedown", function(e){
      if (!document.body.classList.contains("kk-edit-mode") || !s.imgEl) return;
      if (e.target.closest(".kk-edit-zoom")) return;
      e.preventDefault();
      startPan(s, e.clientX, e.clientY);
    });
    el.addEventListener("touchstart", function(e){
      if (!document.body.classList.contains("kk-edit-mode") || !s.imgEl) return;
      var t = e.touches[0];
      startPan(s, t.clientX, t.clientY);
    }, { passive: true });

    el.addEventListener("wheel", function(e){
      if (!document.body.classList.contains("kk-edit-mode") || !s.imgEl) return;
      e.preventDefault();
      s.zoom = clamp(s.zoom - e.deltaY * 0.0015, 1, 3);
      applyVisual(s);
      updatePanel();
    }, { passive: false });

    var hint = document.createElement("span");
    hint.className = "kk-edit-hint";
    hint.textContent = "ドラッグ&ドロップ、またはクリックで写真を選択／ドラッグで位置調整／ホイールで拡大縮小";
    el.appendChild(hint);

    var zoomBox = document.createElement("span");
    zoomBox.className = "kk-edit-zoom";
    zoomBox.innerHTML = '<button type="button" data-z="-1">－</button><button type="button" data-z="1">＋</button>';
    zoomBox.addEventListener("click", function(e){
      e.stopPropagation();
      var btn = e.target.closest("button");
      if (!btn) return;
      s.zoom = clamp(s.zoom + (btn.dataset.z === "1" ? 0.1 : -0.1), 1, 3);
      applyVisual(s);
      updatePanel();
    });
    el.appendChild(zoomBox);
  }

  document.addEventListener("mousemove", function(e){ if (pan) movePan(e.clientX, e.clientY); });
  document.addEventListener("mouseup", endPan);
  document.addEventListener("touchmove", function(e){
    if (pan){ var t = e.touches[0]; movePan(t.clientX, t.clientY); }
  }, { passive: true });
  document.addEventListener("touchend", endPan);

  function register(el){
    var id = el.dataset.editSlot;
    if (!id || slots[id]) return;
    var imgEl = el.tagName === "IMG" ? el : el.querySelector("img");
    var s = {
      el: el, imgEl: imgEl || null,
      kind: el.dataset.editKind || "html",
      ratio: parseFloat(el.dataset.editRatio) || 1,
      path: el.dataset.editPath || "",
      newPath: el.dataset.editNewPath || el.dataset.editPath || "",
      label: el.dataset.editLabel || id,
      where: el.dataset.editWhere || "",
      isNew: false, file: null,
      posX: 50, posY: 50, zoom: 1,
      origPosX: 50, origPosY: 50, origZoom: 1
    };
    if (imgEl){
      var pos = (imgEl.style.objectPosition || "50% 50%").split(" ");
      var px = parseFloat(pos[0]), py = parseFloat(pos[1]);
      if (!isNaN(px)) s.posX = s.origPosX = px;
      if (!isNaN(py)) s.posY = s.origPosY = py;
      var z = parseFloat(imgEl.style.getPropertyValue("--zoom"));
      if (!isNaN(z)) s.zoom = s.origZoom = z;
    }
    slots[id] = s;
    wireSlot(s);
  }

  function scan(){
    document.querySelectorAll("[data-edit-slot]").forEach(register);
  }

  function longEdgeFor(ratio){
    return ratio >= 1.8 ? 2200 : 1400;
  }

  function drawResized(imgEl, ratio){
    return new Promise(function(resolve){
      var iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
      var longEdge = longEdgeFor(ratio);
      var outW, outH;
      if (iw >= ih){ outW = Math.min(longEdge, iw); outH = outW * ih / iw; }
      else { outH = Math.min(longEdge, ih); outW = outH * iw / ih; }
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(outW); canvas.height = Math.round(outH);
      canvas.getContext("2d").drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function(blob){ resolve(blob); }, "image/jpeg", 0.85);
    });
  }

  function triggerDownload(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }

  function styleValue(s){
    var pos = Math.round(s.posX) + "% " + Math.round(s.posY) + "%";
    var parts = ["object-position:" + pos];
    if (Math.abs(s.zoom - 1) > 0.01) parts.push("--zoom:" + s.zoom.toFixed(2));
    return parts.join("; ");
  }

  function buildReportItem(s){
    var filename = (s.newPath || s.path).split("/").pop();
    var repoDisplayPath = repoRelative(s.newPath || s.path);
    var html = '<li' + (s.isNew ? ' data-file="' + escapeHtml(filename) + '"' : "") + '><strong>' + escapeHtml(s.label) + "</strong>";

    if (s.isNew){
      html += "<div>写真ファイル「" + escapeHtml(filename) + "」を、下のボタンでダウンロードして " +
        "<code>kawasaki-kaito-hp/" + escapeHtml(repoDisplayPath) + "</code> に保存してください" +
        (s.path ? "（同じファイル名で上書き）" : "") + "。</div>";
    }

    var posChanged = Math.round(s.posX) !== 50 || Math.round(s.posY) !== 50 || Math.abs(s.zoom - 1) > 0.01;
    var needsNewMarkup = s.kind === "html" && s.isNew && !s.path;

    if (needsNewMarkup){
      var styleAttr = posChanged ? ' style="' + styleValue(s) + '"' : "";
      var tag = '<img src="' + s.newPath + '" alt="' + s.label + '" loading="lazy"' + styleAttr + '>';
      html += "<div>" + escapeHtml(s.where) + " の中身を、次のタグに置き換えてください:<br>" +
        '<code class="kk-copyval">' + escapeHtml(tag) +
        '<button class="kk-copy-btn" data-copy="' + escapeHtml(tag) + '">コピー</button></code></div>';
    } else if (s.kind === "archive"){
      var props = [];
      if (s.isNew){ props.push('img:"' + s.newPath + '"'); props.push('alt:"' + s.label + '"'); }
      if (posChanged || s.isNew) props.push('pos:"' + Math.round(s.posX) + "% " + Math.round(s.posY) + '%"');
      if (Math.abs(s.zoom - 1) > 0.01) props.push('zoom:"' + s.zoom.toFixed(2) + '"');
      var propsStr = props.join(", ");
      html += "<div>" + escapeHtml(s.where) + " に次のプロパティを追加・更新してください:<br>" +
        '<code class="kk-copyval">' + escapeHtml(propsStr) +
        '<button class="kk-copy-btn" data-copy="' + escapeHtml(propsStr) + '">コピー</button></code></div>';
    } else if (posChanged){
      var val = styleValue(s);
      html += "<div>" + escapeHtml(s.where) + " の style を次の値にしてください:<br>" +
        '<code class="kk-copyval">' + escapeHtml(val) +
        '<button class="kk-copy-btn" data-copy="' + escapeHtml(val) + '">コピー</button></code></div>';
    }

    html += "</li>";
    return html;
  }

  function updatePanel(){
    if (!panel) return;
    var dirty = Object.keys(slots).map(function(k){ return slots[k]; }).filter(isDirty);
    if (!dirty.length){
      panelCount.textContent = "変更はまだありません";
      exportBtn.hidden = true;
      return;
    }
    panelCount.textContent = dirty.length + "件、写真を変更しました";
    exportBtn.hidden = false;
  }

  function doExport(){
    var dirty = Object.keys(slots).map(function(k){ return slots[k]; }).filter(isDirty);
    if (!dirty.length) return;

    var itemsHtml = "";
    dirty.forEach(function(s){ itemsHtml += buildReportItem(s); });
    panelList.innerHTML = itemsHtml +
      '<li style="border-top:1px solid var(--line,#eee);color:var(--ink-soft,#888);list-style:none;">' +
      "分からない場合はこの画面をキャプチャして送ってください。代わりに直します。</li>";

    panelList.querySelectorAll(".kk-copy-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        navigator.clipboard.writeText(btn.dataset.copy).then(function(){
          btn.textContent = "コピーしました";
          btn.classList.add("copied");
          setTimeout(function(){ btn.textContent = "コピー"; btn.classList.remove("copied"); }, 1500);
        });
      });
    });

    dirty.filter(function(s){ return s.isNew; }).forEach(function(s){
      drawResized(s.imgEl, s.ratio).then(function(blob){
        var filename = (s.newPath || s.path).split("/").pop();
        var sizeKB = Math.round(blob.size / 1024);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "kk-export-btn";
        btn.style.marginTop = ".4rem";
        btn.textContent = "「" + filename + "」をダウンロード（" + sizeKB + "KB）";
        btn.addEventListener("click", function(){ triggerDownload(blob, filename); });
        var targetLi = panelList.querySelector('[data-file="' + CSS.escape(filename) + '"]');
        if (targetLi) targetLi.appendChild(btn);
      });
    });
  }

  function injectStyle(){
    var css =
      ".kk-edit-toggle{position:fixed;right:1rem;bottom:1rem;z-index:9999;" +
      "font:12px/1 sans-serif;letter-spacing:.05em;padding:.7em 1.1em;border-radius:999px;" +
      "border:1px solid var(--line,#ccc);background:var(--card,#fff);color:var(--ink,#222);" +
      "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);}" +
      ".kk-edit-toggle.on{background:var(--hido,#9C3B22);color:var(--paper,#fff);border-color:var(--hido,#9C3B22);}" +
      "body.kk-edit-mode [data-edit-slot]{outline:2px dashed transparent;outline-offset:-2px;cursor:grab;transition:outline-color .15s ease;}" +
      "body.kk-edit-mode [data-edit-slot]:hover{outline-color:var(--hido,#9C3B22);}" +
      "body.kk-edit-mode [data-edit-slot].kk-dragover{outline-color:var(--hido,#9C3B22);outline-style:solid;}" +
      "body.kk-edit-mode [data-edit-slot].kk-panning{cursor:grabbing;}" +
      ".kk-edit-file-input{display:none;}" +
      ".kk-edit-hint{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;" +
      "text-align:center;padding:.6rem;font:11px/1.5 sans-serif;letter-spacing:.03em;color:#fff;" +
      "background:rgba(20,14,10,.55);opacity:0;pointer-events:none;transition:opacity .15s ease;}" +
      "body.kk-edit-mode [data-edit-slot]:hover .kk-edit-hint{opacity:1;}" +
      ".kk-edit-zoom{position:absolute;right:.4rem;bottom:.4rem;z-index:6;display:none;gap:.25rem;}" +
      "body.kk-edit-mode [data-edit-slot]:hover .kk-edit-zoom{display:flex;}" +
      ".kk-edit-zoom button{width:1.6rem;height:1.6rem;border-radius:50%;border:1px solid rgba(255,255,255,.6);" +
      "background:rgba(20,14,10,.6);color:#fff;font-size:.85rem;line-height:1;cursor:pointer;}" +
      ".kk-edit-panel{position:fixed;left:1rem;bottom:1rem;z-index:9999;max-width:min(420px,calc(100vw - 2rem));" +
      "background:var(--card,#fff);border:1px solid var(--line,#ccc);border-radius:6px;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.22);padding:.9rem 1rem;font:12px/1.6 sans-serif;color:var(--ink,#222);display:none;}" +
      ".kk-edit-panel.show{display:block;}" +
      ".kk-edit-panel h4{margin:0 0 .5rem;font-size:.85rem;letter-spacing:.05em;}" +
      "button.kk-export-btn{margin-top:.5rem;width:100%;padding:.6em;border-radius:4px;border:none;" +
      "background:var(--hido,#9C3B22);color:#fff;font-size:.8rem;letter-spacing:.05em;cursor:pointer;}" +
      ".kk-export-list{margin:.6rem 0 0;padding:0;list-style:none;max-height:45vh;overflow:auto;}" +
      ".kk-export-list li{padding:.6rem 0;border-top:1px solid var(--line,#eee);font-size:.75rem;}" +
      ".kk-export-list code.kk-copyval{display:block;background:rgba(120,90,70,.1);" +
      "padding:.4em .5em;border-radius:3px;margin:.3em 0;word-break:break-all;font-size:.72rem;}" +
      ".kk-copy-btn{font-size:.68rem;padding:.25em .6em;border-radius:999px;border:1px solid var(--line,#ccc);" +
      "background:transparent;cursor:pointer;margin-left:.4em;}" +
      ".kk-copy-btn.copied{border-color:var(--hido,#9C3B22);color:var(--hido,#9C3B22);}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildToggle(){
    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "kk-edit-toggle";
    toggleBtn.textContent = "✎ 写真を編集";
    toggleBtn.addEventListener("click", toggle);
    document.body.appendChild(toggleBtn);
  }

  function buildPanel(){
    panel = document.createElement("div");
    panel.className = "kk-edit-panel";
    panel.innerHTML =
      "<h4>写真編集モード</h4>" +
      '<div id="kkEditCount">変更はまだありません</div>' +
      '<button type="button" class="kk-export-btn" id="kkExportBtn" hidden>書き出す</button>' +
      '<ul class="kk-export-list" id="kkExportList"></ul>';
    document.body.appendChild(panel);
    panelCount = panel.querySelector("#kkEditCount");
    exportBtn = panel.querySelector("#kkExportBtn");
    panelList = panel.querySelector("#kkExportList");
    exportBtn.addEventListener("click", doExport);
  }

  function toggle(){
    var on = document.body.classList.toggle("kk-edit-mode");
    toggleBtn.classList.toggle("on", on);
    toggleBtn.textContent = on ? "✕ 編集終了" : "✎ 写真を編集";
    panel.classList.toggle("show", on);
  }

  function init(){
    injectStyle();
    buildToggle();
    buildPanel();
    scan();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.KKEditMode = { scan: scan };
})();
