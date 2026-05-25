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

  const config = JSON.stringify({
    accountHref: opts.accountHref ?? "/account",
    linkedAccountsHref:
      opts.linkedAccountsHref ?? "/account/settings/linked-accounts",
    signOutLabel: opts.signOutLabel ?? "Sign out",
  });

  return (
    `<span class="account-slot" data-account-slot>${anonHtml}</span>` +
    `<script>(${bootstrapAccountSlotSource})(${config});</script>`
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
  function bindOneSlot(slot) {
    if (slot.dataset.accountSlotBound === '1') return;
    slot.dataset.accountSlotBound = '1';
    function setAnonymous() {
      slot.innerHTML =
        '<a data-account-slot-anon class="account-slot__signin" href="/account/sign-in">Sign in</a>';
    }
    function setSignedIn(user) {
      slot.innerHTML = buildSignedInHtml(user);
      var trigger = slot.querySelector('[data-account-slot-trigger]');
      var menu = slot.querySelector('[data-account-slot-menu]');
      if (trigger && menu) {
        trigger.addEventListener('click', function () {
          var open = !menu.hidden;
          menu.hidden = open;
          trigger.setAttribute('aria-expanded', String(!open));
        });
        document.addEventListener('click', function (ev) {
          if (!slot.contains(ev.target)) {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
        document.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
      }
      var form = slot.querySelector('[data-account-slot-signout]');
      if (form) {
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          fetch('/api/auth/sign-out', {
            method: 'POST',
            credentials: 'include',
          }).then(function () { refreshAll(); });
        });
      }
    }
    slot.refresh = function () {
      // Always round-trip — Better Auth's session cookie is HttpOnly
      // so JS can't see it via document.cookie. Don't try to gate the
      // probe behind a cookie sniff; that pattern always reads as
      // anonymous and breaks signed-in chrome on every page.
      fetch('/api/auth/get-session', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.user) setSignedIn(data.user);
          else setAnonymous();
        })
        .catch(function () { setAnonymous(); });
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
