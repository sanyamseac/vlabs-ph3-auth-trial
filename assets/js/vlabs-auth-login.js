// login.html: email first, then whichever way the account signs in.
(function () {
  "use strict";

  const { api, ApiError } = VlabsAuth;
  const $ = (sel) => document.querySelector(sel);
  const alertEl = $("#alert");

  const query = new URLSearchParams(location.search);
  const next = new URL(VlabsAuth.safeNext(query.get("next")));
  const authError = query.get("auth_error");
  query.delete("auth_error");
  // Where provider redirects and email links come back to: this page, with
  // its ?next= but without errors or tokens.
  const returnTo = location.origin + location.pathname + (query.toString() ? "?" + query : "");

  // Email links carry their token in the fragment: #verify=… or #reset=….
  function linkFromFragment() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    // Keep email tokens out of the address bar, history and bookmarks.
    if (location.hash) history.replaceState(null, "", returnTo);
    if (fragment.get("verify")) return { purpose: "verify", token: fragment.get("verify") };
    if (fragment.get("reset")) return { purpose: "reset", token: fragment.get("reset") };
    return null;
  }

  const initialLink = linkFromFragment();
  if (authError) history.replaceState(null, "", returnTo);

  const AUTH_ERRORS = {
    access_denied: "Sign-in was cancelled.",
    email_unverified: "That account's email address isn't verified with the provider. Verify it there, or sign in another way.",
    email_domain_not_allowed: "Your institution's sign-in returned an address outside its domain. Sign in with your institutional account.",
    email_missing: "The provider didn't share an email address with us. Try another way to sign in.",
    account_disabled: "This account has been disabled. Contact support@vlabs.ac.in.",
    state_mismatch: "Sign-in was started in another tab or browser. Please try again.",
    state_expired: "Sign-in took too long. Please try again.",
    rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
  };

  const TITLES = {
    verify: "Create your account",
    "verify-sent": "Create your account",
    signup: "Create your account",
    forgot: "Reset your password",
    "forgot-sent": "Reset your password",
    reset: "Choose a new password",
  };

  const PROVIDER_ICONS = { google: "fa-google", microsoft: "fa-windows", github: "fa-github", oidc: "fa-university" };

  let config = { turnstile: { enabled: false }, providers: [], password: { min_length: 8 } };
  let email = "";
  let token = ""; // from an email link

  function show(view) {
    document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== view));
    Forms.hideAlert(alertEl);
    document.querySelectorAll("[data-email]").forEach((e) => (e.textContent = email));
    document.querySelectorAll("[data-email-value]").forEach((e) => (e.value = email));
    $("#title").textContent = TITLES[view] || "Sign in to Virtual Labs";
    const input = $('[data-view="' + view + '"] input:not([hidden]):not([readonly])');
    if (input) input.focus();
  }

  function busy(text) {
    $("#busy-text").textContent = text;
    show("busy");
  }

  function showError(err) {
    Forms.showAlert(alertEl, Forms.message(err));
  }

  // After any sign-in. New accounts fill in their registration details first.
  function finish(s) {
    busy("Signing you in…");
    if (s.profile_complete || next.pathname.endsWith("/profile.html")) location.replace(next.href);
    else location.replace(VlabsAuth.profileUrl(next.pathname + next.search + next.hash));
  }

  // ---- Turnstile -----------------------------------------------------------

  let turnstileScript = null;

  function loadTurnstile() {
    turnstileScript =
      turnstileScript ||
      new Promise((resolve, reject) => {
        window.onTurnstileLoad = () => resolve(window.turnstile);
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
        s.async = true;
        s.onerror = () => {
          turnstileScript = null;
          reject(new ApiError(0, { error: "turnstile_unavailable", message: "The verification check couldn't load. Check your connection and try again." }));
        };
        document.head.append(s);
      });
    return turnstileScript;
  }

  // One widget per form. The action must match what the API expects, so a
  // token solved for one form can't be used on another. Tokens are single-use:
  // reset() after every API call.
  function challenge(container, action) {
    let widget = null;
    let solved = "";
    return {
      async render() {
        container.hidden = !config.turnstile.enabled;
        if (!config.turnstile.enabled) return;
        const turnstile = await loadTurnstile();
        solved = "";
        if (widget !== null) {
          turnstile.reset(widget);
          return;
        }
        widget = turnstile.render(container, {
          sitekey: config.turnstile.site_key,
          action,
          theme: "light",
          callback: (t) => (solved = t),
          "expired-callback": () => (solved = ""),
          "error-callback": () => {
            solved = "";
          },
        });
      },
      token() {
        if (!config.turnstile.enabled) return undefined;
        if (!solved) {
          throw new ApiError(0, { error: "turnstile_pending", message: "Please wait for the verification check to finish, then try again." });
        }
        return solved;
      },
      reset() {
        solved = "";
        if (widget !== null) window.turnstile.reset(widget);
      },
    };
  }

  const signupChallenge = challenge($("#turnstile-signup"), "signup");
  const resetChallenge = challenge($("#turnstile-reset"), "password_reset");

  // ---- Forms ---------------------------------------------------------------

  function value(form, name) {
    return form.elements.namedItem(name).value;
  }

  function onSubmit(form, handler, codeFields) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = form.querySelector("[type=submit]");
      Forms.clearErrors(form);
      Forms.hideAlert(alertEl);
      Forms.busy(button, true);
      try {
        await handler(form);
      } catch (err) {
        Forms.handleError(err, form, alertEl, codeFields);
      } finally {
        Forms.busy(button, false);
      }
    });
  }

  // route follows the lookup's answer.
  function route(r) {
    if (r.next === "password") {
      show("password");
      return;
    }
    if (r.next === "verify_email") {
      show("verify");
      signupChallenge.render().catch(showError);
      return;
    }
    // "redirect": the provider this account uses, or the college sign-in
    // that new addresses in this email domain must use.
    const name = r.provider.name;
    const link = $("#redirect-link");
    link.href = r.redirect_url;
    link.textContent = "Continue with " + name;
    $("#redirect-password").hidden = !r.password_available;
    if (r.status === "existing" && r.password_available) {
      $("#redirect-text").textContent = "You usually sign in to this account with " + name + ".";
      show("redirect");
      return;
    }
    $("#redirect-text").textContent =
      r.status === "existing"
        ? "You signed up with " + name + ". Taking you there…"
        : "Accounts at " + email.split("@").pop() + " sign in with " + name + ". Taking you there…";
    show("redirect");
    location.assign(r.redirect_url);
  }

  onSubmit($("#email-form"), async (form) => {
    email = value(form, "email").trim().toLowerCase();
    route(await api("POST", "/api/v1/auth/lookup", { email, return_to: returnTo }));
  });

  onSubmit(
    $("#password-form"),
    async (form) => {
      finish(await api("POST", "/api/v1/auth/login", { email, password: value(form, "password") }));
    },
    { invalid_credentials: "password" }
  );

  onSubmit($("#verify-form"), async () => {
    const turnstileToken = signupChallenge.token();
    let r;
    try {
      r = await api("POST", "/api/v1/auth/signup/email", { email, turnstile_token: turnstileToken, return_to: returnTo });
    } catch (err) {
      signupChallenge.reset();
      if (err.code === "sso_required") {
        route({ status: "new", next: "redirect", provider: err.body.provider, redirect_url: err.body.redirect_url });
        return;
      }
      if (err.code === "account_exists") show("password");
      throw err;
    }
    $("#verify-ttl").textContent = Forms.duration(r.expires_in);
    show("verify-sent");
  });

  onSubmit($("#forgot-form"), async (form) => {
    const turnstileToken = resetChallenge.token();
    email = value(form, "email").trim().toLowerCase();
    let r;
    try {
      r = await api("POST", "/api/v1/auth/password/forgot", { email, turnstile_token: turnstileToken, return_to: returnTo });
    } finally {
      resetChallenge.reset();
    }
    $("#reset-ttl").textContent = Forms.duration(r.expires_in);
    show("forgot-sent");
  });

  // ---- Email links ---------------------------------------------------------

  function linkError(err) {
    if (err.code === "invalid_token") {
      show("link-invalid");
      return;
    }
    show("email");
    Forms.showAlert(alertEl, Forms.message(err), err.code === "account_exists" ? "info" : "danger");
  }

  async function startSignup() {
    busy("Checking your link…");
    try {
      email = (await api("POST", "/api/v1/auth/signup/verify", { token })).email;
    } catch (err) {
      linkError(err);
      return;
    }
    show("signup");
  }

  function openLink(link) {
    token = link.token;
    if (link.purpose === "verify") startSignup();
    else show("reset");
  }

  // A link opened in a tab that is already on this page only changes the
  // fragment, which doesn't reload the page.
  window.addEventListener("hashchange", () => {
    const link = linkFromFragment();
    if (link) openLink(link);
  });

  onSubmit($("#signup-form"), async (form) => {
    let s;
    try {
      s = await api("POST", "/api/v1/auth/signup/complete", { token, name: value(form, "name"), password: value(form, "password") });
    } catch (err) {
      if (err.code === "invalid_token" || err.code === "account_exists") {
        linkError(err);
        return;
      }
      throw err;
    }
    finish(s);
  });

  onSubmit($("#reset-form"), async (form) => {
    let s;
    try {
      s = await api("POST", "/api/v1/auth/password/reset", { token, password: value(form, "password") });
    } catch (err) {
      if (err.code === "invalid_token") {
        linkError(err);
        return;
      }
      throw err;
    }
    finish(s);
  });

  // ---- Buttons -------------------------------------------------------------

  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    switch (button.dataset.action) {
      case "change-email":
      case "back":
        $("#email").value = email;
        show("email");
        break;
      case "use-password":
        show("password");
        break;
      case "forgot":
        $("#forgot-email").value = email;
        show("forgot");
        resetChallenge.render().catch(showError);
        break;
      case "resend":
        show("verify");
        signupChallenge.render().catch(showError);
        break;
    }
  });

  function renderProviders() {
    const buttons = config.providers.map((p) => {
      const a = document.createElement("a");
      a.className = "vl-provider-btn";
      a.href = VlabsAuth.oauthStartUrl(p.id, returnTo);
      const icon = document.createElement("i");
      icon.className = "fa " + (PROVIDER_ICONS[p.kind] || PROVIDER_ICONS.oidc);
      icon.setAttribute("aria-hidden", "true");
      a.append(icon, " Continue with " + p.name);
      return a;
    });
    $("#provider-buttons").replaceChildren(...buttons);
    $("#providers").hidden = buttons.length === 0;
  }

  async function init() {
    try {
      config = await api("GET", "/api/v1/auth/config");
    } catch (err) {
      show("email");
      showError(err);
      return;
    }
    renderProviders();
    document.querySelectorAll("[data-password-hint]").forEach((h) => {
      h.textContent = "At least " + config.password.min_length + " characters. Avoid common passwords and your email address.";
    });

    if (initialLink) {
      openLink(initialLink);
      return;
    }
    // Back from a provider, or already signed in on another lab.
    const s = await VlabsAuth.session().catch(() => ({ authenticated: false }));
    if (s.authenticated) {
      finish(s);
      return;
    }
    show("email");
    if (authError) Forms.showAlert(alertEl, AUTH_ERRORS[authError] || "Sign-in didn't work. Please try again in a little while.", "warning");
  }

  init();
})();
