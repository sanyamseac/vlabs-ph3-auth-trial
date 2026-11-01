// Virtual Labs sign-in client, included on every lab and experiment page.
// It talks to the auth service (tool-virtual-labs-auth-analytics), renders
// the "Sign in" button / account menu into any element marked
// data-vlabs-auth, and remembers referral codes from ?ref= links.
//
// Settings, as <meta> tags placed before this script:
//   vlabs-auth-pages  directory of login.html and profile.html, relative to
//                     the page (default ".")
//   vlabs-auth-home   where to go after signing in when no page was given
//                     (default "index.html")
//   vlabs-auth-api    auth service URL (default https://auth.vlabs.ac.in on
//                     *.vlabs.ac.in, else port 8080 of the page's host)
(function () {
  "use strict";

  function setting(name) {
    const meta = document.querySelector('meta[name="vlabs-auth-' + name + '"]');
    return meta ? meta.content.trim() : "";
  }

  const onVlabs = /(^|\.)vlabs\.ac\.in$/.test(location.hostname);

  // Local development uses port 8080 on the page's own host name, so the
  // session cookie stays same-site.
  const API = (
    window.VLABS_AUTH_API ||
    setting("api") ||
    (onVlabs ? "https://auth.vlabs.ac.in" : location.protocol + "//" + location.hostname + ":8080")
  ).replace(/\/+$/, "");

  const pagesDir = (setting("pages") || ".").replace(/\/+$/, "") + "/";

  // ---- Referral codes -------------------------------------------------------
  //
  // A link such as https://<lab>.vlabs.ac.in/?ref=WS-2026-HYD carries a
  // workshop, nodal-centre or campaign code. It is kept in a cookie that
  // every lab shares, for 30 days or until the user saves their registration
  // profile, and pre-fills the profile's referral code. The latest link wins.

  const REF_COOKIE = "vlabs_ref";
  const REF_DAYS = 30;
  // The format the API accepts for referral_code.
  const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,63}$/;

  function setRefCookie(value, maxAge) {
    let cookie = REF_COOKIE + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAge + "; SameSite=Lax";
    if (onVlabs) cookie += "; Domain=vlabs.ac.in";
    if (location.protocol === "https:") cookie += "; Secure";
    document.cookie = cookie;
  }

  // referralCode returns the stored referral code, or "".
  function referralCode() {
    const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + REF_COOKIE + "=([^;]*)"));
    try {
      const code = match ? decodeURIComponent(match[1]) : "";
      return REF_PATTERN.test(code) ? code : "";
    } catch {
      return "";
    }
  }

  function clearReferralCode() {
    setRefCookie("", 0);
  }

  {
    const params = new URLSearchParams(location.search);
    const code = (params.get("ref") || params.get("referral_code") || "").trim();
    if (REF_PATTERN.test(code)) setRefCookie(code, REF_DAYS * 24 * 60 * 60);
  }

  // ---- API ------------------------------------------------------------------

  class ApiError extends Error {
    constructor(status, body) {
      super(body.message || "Something went wrong. Please try again.");
      this.status = status;
      this.code = body.error || "unknown_error";
      this.fields = body.fields || {};
      this.retryAfter = body.retry_after || 0;
      this.body = body;
    }
  }

  async function api(method, path, body) {
    const init = { method, credentials: "include", headers: { Accept: "application/json" } };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(API + path, init);
    } catch {
      throw new ApiError(0, {
        error: "network_error",
        message: "Can't reach the Virtual Labs sign-in service. Check your connection and try again.",
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  let sessionPromise = null;

  // The signed-in user, shared by everything on the page:
  // {authenticated, user: {id, email, name, signup_method, created_at}, profile_complete}
  function session(refresh) {
    if (!sessionPromise || refresh) sessionPromise = api("GET", "/api/v1/auth/session");
    return sessionPromise;
  }

  async function logout() {
    await api("POST", "/api/v1/auth/logout");
    sessionPromise = Promise.resolve({ authenticated: false, profile_complete: false });
  }

  // ---- Page links -----------------------------------------------------------

  // safeNext turns a ?next= value into a URL on this site, so the login page
  // can't be used to send people elsewhere. Anything else becomes the home
  // page.
  function safeNext(raw) {
    const home = new URL(setting("home") || "index.html", location.href).href;
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return home;
    try {
      const url = new URL(raw, location.origin);
      return url.origin === location.origin ? url.href : home;
    } catch {
      return home;
    }
  }

  function currentPath() {
    return location.pathname + location.search + location.hash;
  }

  function loginUrl(next) {
    return pagesDir + "login.html?next=" + encodeURIComponent(next || currentPath());
  }

  function profileUrl(next) {
    return pagesDir + (next ? "profile.html?next=" + encodeURIComponent(next) : "profile.html");
  }

  // Provider sign-in is a browser navigation to the API, not a fetch call.
  function oauthStartUrl(providerId, returnTo, loginHint) {
    const q = new URLSearchParams({ return_to: returnTo });
    if (loginHint) q.set("login_hint", loginHint);
    return API + "/api/v1/auth/oauth/" + encodeURIComponent(providerId) + "/start?" + q;
  }

  // ---- Header widget --------------------------------------------------------

  function initials(user) {
    const words = (user.name || user.email).split(/[\s@._-]+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children || []) node.append(child);
    return node;
  }

  function renderSignedOut(slot) {
    slot.replaceChildren(
      el("a", { class: "vl-signin-btn", href: loginUrl() }, [
        el("i", { class: "fa fa-user-circle-o", "aria-hidden": "true" }),
        " Sign in",
      ])
    );
  }

  function renderSignedIn(slot, s) {
    const user = s.user;
    const firstName = (user.name || user.email).split(/\s+/)[0];
    const button = el("button", { type: "button", class: "vl-user-btn", "aria-haspopup": "true", "aria-expanded": "false" }, [
      el("span", { class: "vl-avatar", "aria-hidden": "true", text: initials(user) }),
      el("span", { class: "vl-user-name", text: firstName }),
    ]);
    if (!s.profile_complete) button.append(el("span", { class: "vl-dot", title: "Registration incomplete" }));
    button.append(el("i", { class: "fa fa-caret-down", "aria-hidden": "true" }));

    const menu = el("div", { class: "vl-user-menu", role: "menu", hidden: "" }, [
      el("div", { class: "vl-user-meta" }, [
        el("strong", { text: user.name || "Virtual Labs user" }),
        el("span", { text: user.email }),
      ]),
    ]);
    if (!s.profile_complete) {
      menu.append(
        el("a", { class: "vl-menu-cta", role: "menuitem", href: profileUrl(currentPath()) }, [
          el("i", { class: "fa fa-exclamation-circle", "aria-hidden": "true" }),
          " Complete your registration",
        ])
      );
    }
    const signOut = el("button", { type: "button", role: "menuitem" }, [
      el("i", { class: "fa fa-sign-out", "aria-hidden": "true" }),
      " Sign out",
    ]);
    menu.append(
      el("a", { role: "menuitem", href: profileUrl() }, [
        el("i", { class: "fa fa-id-card-o", "aria-hidden": "true" }),
        " My profile",
      ]),
      signOut
    );

    const open = (yes) => {
      menu.hidden = !yes;
      button.setAttribute("aria-expanded", String(yes));
    };
    button.addEventListener("click", () => open(menu.hidden));
    document.addEventListener("click", (e) => {
      if (!slot.contains(e.target)) open(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        open(false);
        button.focus();
      }
    });
    signOut.addEventListener("click", async () => {
      signOut.disabled = true;
      try {
        await logout();
      } catch {
        signOut.disabled = false;
        return;
      }
      if (document.body.hasAttribute("data-requires-auth")) location.assign(safeNext(null));
      else mountHeader(slot);
    });

    slot.replaceChildren(el("div", { class: "vl-user" }, [button, menu]));
  }

  async function mountHeader(slot) {
    let s;
    try {
      s = await session();
    } catch {
      s = { authenticated: false };
    }
    if (s.authenticated) renderSignedIn(slot, s);
    else renderSignedOut(slot);
  }

  function refreshHeader() {
    session(true);
    document.querySelectorAll("[data-vlabs-auth]").forEach(mountHeader);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-vlabs-auth]").forEach(mountHeader);
  });

  window.VlabsAuth = {
    API, ApiError, api, session, logout, safeNext, loginUrl, profileUrl, oauthStartUrl, refreshHeader,
    referralCode, clearReferralCode,
  };
})();
