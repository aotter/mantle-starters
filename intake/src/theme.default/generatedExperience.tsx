/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";

export const GENERATED_EXPERIENCE_CSS = `
:root {
  --mantle-guide-paper: var(--paper, var(--bg, #fafaf7));
  --mantle-guide-ink: var(--ink, var(--fg, #1a1a1a));
  --mantle-guide-rule: var(--rule, var(--border, #d6d3cb));
  --mantle-guide-muted: var(--mute, var(--muted, #666));
  --mantle-guide-accent: var(--accent, #2563eb);
  --mantle-guide-accent-soft: var(--accent-soft, var(--accent, #60a5fa));
  --mantle-guide-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  --mantle-guide-glass: rgba(255,255,255,0.72);
  --mantle-guide-glass-strong: rgba(255,255,255,0.92);
  --mantle-guide-border: rgba(255,255,255,0.66);
  --mantle-guide-shadow: 0 26px 80px color-mix(in srgb, var(--mantle-guide-ink) 18%, transparent);
}
[data-theme="dark"] {
  --mantle-guide-glass: color-mix(in srgb, var(--mantle-guide-paper) 72%, transparent);
  --mantle-guide-glass-strong: color-mix(in srgb, var(--mantle-guide-paper) 88%, var(--mantle-guide-ink) 12%);
  --mantle-guide-border: color-mix(in srgb, var(--mantle-guide-accent) 24%, var(--mantle-guide-rule));
  --mantle-guide-shadow: 0 30px 90px rgba(0,0,0,0.46);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(32rem 22rem at var(--mantle-pointer-x, 20%) var(--mantle-pointer-y, 12%), color-mix(in srgb, var(--mantle-guide-accent-soft) 16%, transparent), transparent 70%),
    linear-gradient(var(--mantle-guide-rule) 1px, transparent 1px),
    linear-gradient(90deg, var(--mantle-guide-rule) 1px, transparent 1px);
  background-size: auto, 96px 96px, 96px 96px;
  opacity: 0.28;
  mask-image: linear-gradient(180deg, black, transparent 78%);
}
.site-header,
header.site {
  box-shadow: 0 18px 46px color-mix(in srgb, var(--ink) 8%, transparent);
  backdrop-filter: blur(26px) saturate(1.55);
  -webkit-backdrop-filter: blur(26px) saturate(1.55);
}
.site-main,
main {
  scroll-margin-top: 6rem;
}
.product-card,
.entry-list li,
.contact-form,
.post-cover,
.glass-card,
.store-panel,
.merch-card,
.pdp-shell,
.block-card {
  transition: transform 210ms cubic-bezier(.2,.8,.2,1), box-shadow 210ms ease, border-color 210ms ease;
}
.product-card:hover,
.entry-list li:hover,
.contact-form:hover,
.glass-card:hover,
.store-panel:hover,
.merch-card:hover,
.block-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--mantle-guide-shadow);
  border-color: color-mix(in srgb, var(--mantle-guide-accent) 32%, var(--mantle-guide-rule));
}
.mantle-watermark {
  position: fixed;
  right: 1rem;
  bottom: .85rem;
  z-index: 30;
  pointer-events: none;
  color: var(--mantle-guide-ink);
  font: 800 .76rem/1 var(--mantle-guide-mono);
  letter-spacing: .04em;
  opacity: .16;
  mix-blend-mode: multiply;
}
[data-theme="dark"] .mantle-watermark {
  color: var(--mantle-guide-ink);
  mix-blend-mode: screen;
  opacity: .20;
}
.mantle-guide-launcher {
  position: fixed;
  left: 1rem;
  bottom: .85rem;
  z-index: 31;
  display: inline-flex;
  align-items: center;
  gap: .48rem;
  min-height: 2.65rem;
  border: 1px solid var(--mantle-guide-border);
  background:
    linear-gradient(145deg, var(--mantle-guide-glass-strong), var(--mantle-guide-glass)),
    color-mix(in srgb, var(--mantle-guide-accent-soft) 10%, transparent);
  color: var(--mantle-guide-ink);
  padding: .68rem .9rem;
  font: 800 .82rem/1 var(--mantle-guide-mono);
  cursor: pointer;
  box-shadow: var(--mantle-guide-shadow), inset 0 1px 0 rgba(255,255,255,.72);
  backdrop-filter: blur(24px) saturate(1.45);
  -webkit-backdrop-filter: blur(24px) saturate(1.45);
}
.mantle-guide-launcher svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mantle-guide-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  background: color-mix(in srgb, var(--mantle-guide-paper) 26%, transparent);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.mantle-guide-highlight {
  position: fixed;
  z-index: 61;
  pointer-events: none;
  border: 2px solid color-mix(in srgb, var(--mantle-guide-accent) 76%, white);
  background: color-mix(in srgb, var(--mantle-guide-accent-soft) 16%, transparent);
  box-shadow:
    0 0 0 9999px color-mix(in srgb, var(--mantle-guide-ink) 18%, transparent),
    0 24px 78px color-mix(in srgb, var(--mantle-guide-accent) 24%, transparent),
    inset 0 0 0 1px rgba(255,255,255,.5);
}
.mantle-guide-popover {
  position: fixed;
  z-index: 62;
  width: min(25rem, calc(100vw - 2rem));
  border: 1px solid var(--mantle-guide-border);
  background:
    linear-gradient(145deg, var(--mantle-guide-glass-strong), var(--mantle-guide-glass)),
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--mantle-guide-accent-soft) 22%, transparent), transparent 42%);
  color: var(--mantle-guide-ink);
  padding: 1rem;
  pointer-events: auto;
  box-shadow: var(--mantle-guide-shadow), inset 0 1px 0 rgba(255,255,255,.72);
  backdrop-filter: blur(28px) saturate(1.45);
  -webkit-backdrop-filter: blur(28px) saturate(1.45);
}
.mantle-guide-popover[data-floating="1"] {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.mantle-guide-progress {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .75rem;
  color: var(--mantle-guide-muted);
  font: 800 .76rem/1 var(--mantle-guide-mono);
  letter-spacing: .14em;
  text-transform: uppercase;
}
.mantle-guide-popover h2 {
  margin: 0 0 .55rem;
  font-size: 1.25rem;
  line-height: 1.28;
}
.mantle-guide-popover p {
  margin: 0;
  color: var(--mantle-guide-muted);
  line-height: 1.72;
}
.mantle-guide-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .55rem;
  margin-top: 1rem;
}
.mantle-guide-actions button,
.mantle-guide-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.55rem;
  border: 1px solid var(--mantle-guide-rule);
  background: var(--mantle-guide-glass);
  color: var(--mantle-guide-ink);
  padding: .65rem .88rem;
  font: 800 .82rem/1 var(--mantle-guide-mono);
  cursor: pointer;
  text-decoration: none;
}
.mantle-guide-actions .mantle-guide-primary {
  border-color: var(--mantle-guide-accent);
  background: var(--mantle-guide-accent);
  color: var(--mantle-guide-paper);
}
.mantle-guide-actions .mantle-guide-quiet {
  margin-left: auto;
  min-width: 2.55rem;
  padding-inline: .75rem;
}
.mantle-guide-message {
  min-height: 1.2rem;
  margin-top: .65rem;
  color: var(--mantle-guide-ink);
  font-size: .84rem;
  font-weight: 800;
}
@media (max-width: 560px) {
  .mantle-watermark { right: .75rem; bottom: .65rem; font-size: .68rem; }
  .mantle-guide-launcher { left: .75rem; bottom: .65rem; padding-inline: .72rem; }
  .mantle-guide-launcher span { display: none; }
  .mantle-guide-popover {
    left: 1rem !important;
    right: 1rem !important;
    top: auto !important;
    bottom: 1rem !important;
    width: auto;
    transform: none !important;
  }
  .mantle-guide-actions .mantle-guide-quiet { margin-left: 0; }
}
`;

export const GENERATED_EXPERIENCE_JS = `
(function(){
  var html = document.documentElement;
  function setPointer(ev){
    html.style.setProperty("--mantle-pointer-x", ev.clientX + "px");
    html.style.setProperty("--mantle-pointer-y", ev.clientY + "px");
  }
  window.addEventListener("pointermove", setPointer, { passive: true });
  window.__mantleGuide = {
    storageKey: "aottermantle.generatedGuide.dismissed",
    index: 0,
    steps: [
      { selector: ".site-header, header.site", title: "這是你的網站入口", body: "網站已經產生好基礎導覽、語系、深色模式與響應式版面。之後可以用後台或 LLM 持續調整內容。" },
      { selector: ".site-main, main", title: "主要內容可以直接更新", body: "首頁、文章、表單或商品區會依照 starter 類型長出 placeholder。你可以先確認版型，再替換真實內容。" },
      { selector: ".site-footer, footer.site", title: "後台在 /admin", body: "管理後台可以編輯內容、媒體與站點設定。可以複製後台網址，或開啟後按瀏覽器書籤快捷鍵收藏。" },
      { selector: "[data-mantle-guide-launcher]", title: "隨時重開引導", body: "每個 AotterMantle 產生的網站都會保留這個引導入口，讓使用者知道下一步該做什麼。" }
    ],
    open: function(index){ this.index = typeof index === "number" ? index : 0; this.render(); },
    close: function(){ try { localStorage.setItem(this.storageKey, "1"); } catch(_) {} var layer = document.querySelector("[data-mantle-guide-layer]"); if(layer) layer.remove(); },
    next: function(){ if(this.index >= this.steps.length - 1) return this.close(); this.index += 1; this.render(); },
    prev: function(){ this.index = Math.max(0, this.index - 1); this.render(); },
    escape: function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); },
    adminUrl: function(){ return window.location.origin + "/admin"; },
    copyAdminUrl: function(){
      var msg = document.querySelector("[data-mantle-guide-message]");
      var done = function(){ if(msg) msg.textContent = "已複製後台網址。開啟後台後可按 " + (navigator.platform.indexOf("Mac") >= 0 ? "Command+D" : "Ctrl+D") + " 加入書籤。"; };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(window.__mantleGuide.adminUrl()).then(done).catch(done);
      else done();
    },
    targetRect: function(step){
      if(!step.selector) return null;
      var nodes = document.querySelectorAll(step.selector);
      for(var i = 0; i < nodes.length; i += 1){
        var el = nodes[i];
        var rect = el.getBoundingClientRect();
        var style = window.getComputedStyle(el);
        if(rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"){
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          return el.getBoundingClientRect();
        }
      }
      return null;
    },
    popoverStyle: function(rect){
      if(!rect) return 'data-floating="1"';
      var width = Math.min(400, Math.max(288, window.innerWidth - 32));
      var top = Math.max(16, Math.min(window.innerHeight - 260, rect.top));
      var left = rect.left + rect.width + width + 20 < window.innerWidth
        ? rect.left + rect.width + 16
        : Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
      if(rect.left + rect.width + width + 20 >= window.innerWidth) top = Math.min(window.innerHeight - 260, rect.bottom + 16);
      return 'style="top:' + top + 'px;left:' + left + 'px"';
    },
    render: function(){
      var step = this.steps[this.index] || this.steps[0];
      var rect = this.targetRect(step);
      var old = document.querySelector("[data-mantle-guide-layer]");
      if(old) old.remove();
      var highlight = rect ? '<div class="mantle-guide-highlight" style="top:' + Math.max(0, rect.top - 8) + 'px;left:' + Math.max(0, rect.left - 8) + 'px;width:' + (rect.width + 16) + 'px;height:' + (rect.height + 16) + 'px"></div>' : "";
      var layer = document.createElement("div");
      layer.className = "mantle-guide-layer";
      layer.setAttribute("data-mantle-guide-layer", "1");
      layer.innerHTML =
        highlight +
        '<section class="mantle-guide-popover" ' + this.popoverStyle(rect) + ' role="dialog" aria-modal="false" aria-labelledby="mantle-guide-title">' +
          '<div class="mantle-guide-progress"><span>AotterMantle</span><span>' + (this.index + 1) + " / " + this.steps.length + '</span></div>' +
          '<h2 id="mantle-guide-title">' + this.escape(step.title) + '</h2>' +
          '<p>' + this.escape(step.body) + '</p>' +
          '<div class="mantle-guide-actions">' +
            '<a class="mantle-guide-primary" href="/admin" target="_blank" rel="noreferrer">開啟後台</a>' +
            '<button type="button" data-mantle-copy-admin="1">複製後台網址</button>' +
            '<button type="button" data-mantle-guide-prev="1"' + (this.index === 0 ? " disabled" : "") + '>上一步</button>' +
            '<button class="mantle-guide-primary" type="button" data-mantle-guide-next="1">' + (this.index >= this.steps.length - 1 ? "完成" : "下一步") + '</button>' +
            '<button class="mantle-guide-quiet" type="button" data-mantle-guide-close="1" aria-label="關閉">×</button>' +
          '</div>' +
          '<div class="mantle-guide-message" data-mantle-guide-message></div>' +
        '</section>';
      document.body.appendChild(layer);
      var self = this;
      layer.querySelector("[data-mantle-guide-prev]")?.addEventListener("click", function(){ self.prev(); });
      layer.querySelector("[data-mantle-guide-next]")?.addEventListener("click", function(){ self.next(); });
      layer.querySelector("[data-mantle-guide-close]")?.addEventListener("click", function(){ self.close(); });
      layer.querySelector("[data-mantle-copy-admin]")?.addEventListener("click", function(){ self.copyAdminUrl(); });
    },
    bind: function(){
      var self = this;
      document.querySelector("[data-mantle-guide-launcher]")?.addEventListener("click", function(){ self.open(0); });
      window.addEventListener("resize", function(){ if(document.querySelector("[data-mantle-guide-layer]")) self.render(); });
      window.addEventListener("scroll", function(){ if(document.querySelector("[data-mantle-guide-layer]")) self.render(); }, true);
      try { if(localStorage.getItem(this.storageKey) !== "1") setTimeout(function(){ self.open(0); }, 550); }
      catch(_) { setTimeout(function(){ self.open(0); }, 550); }
    }
  };
  document.addEventListener("DOMContentLoaded", function(){ window.__mantleGuide.bind(); });
})();
`;

export function GeneratedExperience() {
  return (
    <>
      <button
        class="mantle-guide-launcher"
        type="button"
        data-mantle-guide-launcher="1"
        aria-label="開啟網站引導"
      >
        {raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5.1 1.2c0 1.8-2.6 2.2-2.6 4"/><path d="M12 17.5h.01"/></svg>')}
        <span>網站引導</span>
      </button>
      <div class="mantle-watermark" aria-hidden="true">AotterMantle did this!</div>
    </>
  );
}
