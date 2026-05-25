/**
 * Header session-slot helper for the storefront chrome (#218).
 *
 * Drop the output of `renderAccountSlot()` into the chrome template
 * (usually the `<header>` block of a page-shell helper) and the
 * feature handles:
 *   - probing `/api/auth/get-session` on DOMContentLoaded
 *   - swapping the slot's innerHTML for an anonymous "登入 / Sign in"
 *     link vs a signed-in "<name> ▾" trigger
 *   - showing / hiding a dropdown menu (close on outside click or Esc)
 *   - POSTing to `/api/auth/sign-out` and re-running the probe
 *
 * Branding stays starter-local: every element carries a stable
 * `data-account-slot-*` attribute so adopters can attach CSS by attr
 * selector. Inline classes (`account-slot__*`) are provided as a
 * convenience for projects that prefer class-based styling.
 *
 * ## HttpOnly cookie trap (#218)
 *
 * The Better Auth session cookie is HttpOnly — JS CANNOT see it via
 * `document.cookie`. A common copy-paste failure is to short-circuit
 * the probe with `document.cookie.match(/better-auth\.session_token/)`,
 * which always misses and renders anonymous markup for signed-in
 * users. The probe in this helper does NOT sniff cookies; it always
 * round-trips to `/api/auth/get-session`. Cheap and correct.
 *
 * If `bulk anonymous traffic` becomes a real concern, the right fix
 * is an SDK-side non-HttpOnly sentinel cookie (tracked separately).
 */

export interface RenderAccountSlotOptions {
  /** Sign-in link label rendered for anonymous visitors. */
  readonly signInLabel?: string;
  /** Sign-in URL. Default `/account/sign-in`. */
  readonly signInHref?: string;
  /** Account-home URL behind the signed-in dropdown. */
  readonly accountHref?: string;
  /** Linked-accounts settings URL. */
  readonly linkedAccountsHref?: string;
  /** Sign-out label rendered inside the dropdown's `<form>`. */
  readonly signOutLabel?: string;
}

/**
 * Emit the full slot fragment (markup + inline script). Call once per
 * page template. Multiple instances on the same page (e.g. header +
 * mobile drawer) are safe — the bootstrap script binds via
 * `data-account-slot` attributes and walks every matching element.
 */
export function renderAccountSlot(opts: RenderAccountSlotOptions = {}): string {
  const signInLabel = escape(opts.signInLabel ?? "Sign in");
  const signInHref = escape(opts.signInHref ?? "/account/sign-in");
  const accountHref = escape(opts.accountHref ?? "/account");
  const linkedAccountsHref = escape(
    opts.linkedAccountsHref ?? "/account/settings/linked-accounts",
  );
  const signOutLabel = escape(opts.signOutLabel ?? "Sign out");

  // Anonymous markup is server-rendered so a browser without JS — or
  // with the probe still in-flight — has a useful link. The bootstrap
  // script replaces this when a session is detected.
  const anonHtml = `<a data-account-slot-anon class="account-slot__signin" href="${signInHref}">${signInLabel}</a>`;

  // The bootstrap rebuilds anonymous and signed-in markup client-side
  // after the session probe, so it needs the SAME labels/URLs the
  // server used. Without these the client falls back to hardcoded
  // English defaults the moment the probe completes.
  const config = JSON.stringify({
    accountHref: opts.accountHref ?? "/account",
    linkedAccountsHref:
      opts.linkedAccountsHref ?? "/account/settings/linked-accounts",
    signInHref: opts.signInHref ?? "/account/sign-in",
    signInLabel: opts.signInLabel ?? "Sign in",
    signOutLabel: opts.signOutLabel ?? "Sign out",
  });
  // JSON.stringify does not escape `</script>` — without this, a
  // crafted href / label could break out of the inline script tag
  // during HTML parsing. Per the OWASP JS-in-HTML guidance, replace
  // `</` with `<\/`.
  const safeConfig = config.replace(/<\/(script)/gi, "<\\/$1");

  // Span → div: the rendered signed-in branch nests a `<div role="menu">`
  // + `<form>` inside, which is invalid as descendants of <span>.
  return (
    `<div class="account-slot" data-account-slot>${anonHtml}</div>` +
    `<script>(${bootstrapAccountSlotSource})(${safeConfig});</script>`
  );

  function escape(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

/**
 * The bootstrap function is stringified into the inline `<script>`
 * tag at render time, so it must be self-contained — no closure over
 * module-scope helpers, no imports. Kept as a plain JS function for
 * readability + so future edits stay inside the same source file as
 * the renderer.
 *
 * `config` is the inlined JSON-serialized options object; the
 * bootstrap deserializes it (via direct function-call IIFE) so the
 * template doesn't have to inline raw strings into the script body.
 *
 * Comments inside the source are stripped at minification time by the
 * starter's build, but during dev they make the bundle inspectable.
 */
const bootstrapAccountSlotSource = `function bootstrap(config) {
  if (window.__mantleAccountSlotBound) {
    // Two renderAccountSlot() calls on one page would otherwise install
    // duplicate document-level listeners + overwrite the global. The
    // second bootstrap is a no-op; binding still happens via the shared
    // refreshAll() below because every [data-account-slot] is walked.
    window.refreshAccountSlot();
    return;
  }
  window.__mantleAccountSlotBound = true;
  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function buildSignedInHtml(user) {
    var label = escape(user.name || user.email || 'Account');
    return [
      '<button type="button" data-account-slot-trigger class="account-slot__trigger" aria-haspopup="menu" aria-expanded="false">',
      label, ' <span aria-hidden="true">▾</span>',
      '</button>',
      '<div data-account-slot-menu class="account-slot__menu" hidden role="menu">',
      '  <a role="menuitem" href="' + escape(config.accountHref) + '">' + escape(user.name || user.email) + '</a>',
      '  <a role="menuitem" href="' + escape(config.linkedAccountsHref) + '">Linked accounts</a>',
      '  <form method="post" action="/api/auth/sign-out" data-account-slot-signout>',
      '    <button role="menuitem" type="submit">' + escape(config.signOutLabel) + '</button>',
      '  </form>',
      '</div>',
    ].join('');
  }
  function buildAnonHtml() {
    return '<a data-account-slot-anon class="account-slot__signin" href="' +
      escape(config.signInHref) + '">' + escape(config.signInLabel) + '</a>';
  }
  // Document-level listeners installed ONCE (guarded above). They use
  // event delegation so dynamically-inserted slots also benefit, and
  // they never accumulate across sign-in/out cycles.
  document.addEventListener('click', function (ev) {
    // Trigger toggle.
    var trigger = ev.target.closest && ev.target.closest('[data-account-slot-trigger]');
    if (trigger) {
      var menu = trigger.parentElement && trigger.parentElement.querySelector('[data-account-slot-menu]');
      if (menu) {
        var open = !menu.hidden;
        menu.hidden = open;
        trigger.setAttribute('aria-expanded', String(!open));
      }
      return;
    }
    // Outside-click closes any open menu.
    document.querySelectorAll('[data-account-slot] [data-account-slot-menu]').forEach(function (m) {
      if (m.hidden) return;
      if (m.parentElement && !m.parentElement.contains(ev.target)) {
        m.hidden = true;
        var t = m.parentElement.querySelector('[data-account-slot-trigger]');
        if (t) t.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    document.querySelectorAll('[data-account-slot] [data-account-slot-menu]').forEach(function (m) {
      if (m.hidden) return;
      m.hidden = true;
      var t = m.parentElement && m.parentElement.querySelector('[data-account-slot-trigger]');
      if (t) {
        t.setAttribute('aria-expanded', 'false');
        // Restore focus to the trigger so keyboard users aren't dumped
        // into focus limbo after dismissing the menu.
        t.focus();
      }
    });
  });
  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest && ev.target.closest('[data-account-slot-signout]');
    if (!form) return;
    ev.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    // Guard against double-clicks: a rapid second submit would issue
    // a second POST before the first resolves. Disabling the button
    // also gives a visible "in flight" cue.
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    })
      .catch(function () { /* swallow — refresh below recovers */ })
      .then(function () {
        if (btn) btn.disabled = false;
        refreshAll();
      });
  });
  function bindOneSlot(slot) {
    if (slot.dataset.accountSlotBound === '1') return;
    slot.dataset.accountSlotBound = '1';
    slot.refresh = function () {
      // Always round-trip — Better Auth's session cookie is HttpOnly
      // so JS can't see it via document.cookie. Don't try to gate the
      // probe behind a cookie sniff; that pattern always reads as
      // anonymous and breaks signed-in chrome on every page.
      fetch('/api/auth/get-session', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          slot.innerHTML = data && data.user ? buildSignedInHtml(data.user) : buildAnonHtml();
        })
        .catch(function () { slot.innerHTML = buildAnonHtml(); });
    };
    slot.refresh();
  }
  function refreshAll() {
    document.querySelectorAll('[data-account-slot]').forEach(function (s) {
      var firstBind = s.dataset.accountSlotBound !== '1';
      bindOneSlot(s);
      // Skip the explicit refresh on first bind — bindOneSlot already
      // calls slot.refresh() once at the end of its setup.
      if (!firstBind && s.refresh) s.refresh();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAll);
  } else {
    refreshAll();
  }
  // Expose a small global so adopter code can re-run the probe after
  // sign-in/out flows that don't bubble through the slot's own form.
  window.refreshAccountSlot = refreshAll;
}`;
