// profile.html: the registration details (design doc, Table 1). Every option
// list comes from GET /api/v1/profile/options; the API does the validation.
(function () {
  "use strict";

  const { api } = VlabsAuth;
  const $ = (sel) => document.querySelector(sel);
  const form = $("#profile-form");
  const alertEl = $("#alert");
  const nextParam = new URLSearchParams(location.search).get("next");
  const next = nextParam ? VlabsAuth.safeNext(nextParam) : null;

  const DETAIL_LABELS = { student: "Where do you study?", professional: "Your field", academician: "Your position" };

  let options;

  function fill(select, list) {
    const current = select.value;
    select.replaceChildren(new Option("Select…", ""), ...list.map((o) => new Option(o.label, o.value)));
    select.value = list.some((o) => o.value === current) ? current : "";
  }

  function label(el, text, required) {
    el.textContent = text + " ";
    if (required) el.append(Object.assign(document.createElement("span"), { className: "vl-req", textContent: "*" }));
  }

  function india() {
    const country = $("#country").value;
    return country === "IN" || country === "";
  }

  // sync shows the follow-up fields that apply to the current answers.
  function sync() {
    form.querySelectorAll("[data-show-if]").forEach((group) => {
      const [id, value] = group.dataset.showIf.split("=");
      group.hidden = $("#" + id).value !== value;
    });

    // Students, professionals and academicians pick from a list; "Others"
    // may describe themselves.
    const profession = $("#profession").value;
    const details = options.profession_details[profession];
    const detailSelect = $("#profession_detail_select");
    const detailText = $("#profession_detail_text");
    const detailLabel = $("#profession-detail-label");
    form.querySelector('[data-field="profession_detail"]').hidden = !details && profession !== "other";
    detailSelect.hidden = !details;
    detailText.hidden = !!details;
    detailLabel.htmlFor = details ? "profession_detail_select" : "profession_detail_text";
    if (details) fill(detailSelect, details);
    label(detailLabel, details ? DETAIL_LABELS[profession] || "Details" : "Tell us more (optional)", !!details);

    // India: 6-digit PIN code and a list of states. Elsewhere: free text.
    const inIndia = india();
    $("#state_select").hidden = !inIndia;
    $("#state_text").hidden = inIndia;
    $("#state-label").htmlFor = inIndia ? "state_select" : "state_text";
    label($("#state-label"), inIndia ? "State / union territory" : "State, province or region", true);
    label($("#pin-label"), inIndia ? "PIN code" : "Postal code (optional)", inIndia);
    $("#pin_code").inputMode = inIndia ? "numeric" : "text";

    // Workshop participants must fill in the academic details.
    const workshop = $("#referral_source").value === "workshop";
    form.querySelectorAll("[data-workshop-only]").forEach((m) => (m.hidden = !workshop));
    $("#academic-note").textContent = workshop ? "(required for workshop participants)" : "(optional)";
  }

  function load(data) {
    const p = data.profile || {};
    $("#account-email").value = data.email;
    $("#name").value = data.name;
    const ids = [
      "gender", "gender_self_describe", "age_group", "profession", "social_category",
      "referral_source", "referral_source_other", "referral_code", "country", "pin_code",
      "institution_name", "institution_aishe_code", "degree_level", "discipline", "discipline_other",
    ];
    for (const id of ids) $("#" + id).value = p[id] || "";
    $("#graduation_year").value = p.graduation_year ? String(p.graduation_year) : "";
    // A referral code from a link the user followed (see vlabs-auth.js).
    const ref = VlabsAuth.referralCode();
    if (ref && !p.referral_code) $("#referral_code").value = ref;
    $("#referral-hint").textContent =
      ref && !p.referral_code
        ? "Filled in from the link you followed."
        : "Optional. Given by your workshop coordinator or nodal centre.";
    $("#analytics_consent").checked = !!p.analytics_consent;
    sync(); // fills the profession detail list before it is set
    $("#profession_detail_select").value = $("#profession_detail_text").value = p.profession_detail || "";
    $("#state_select").value = $("#state_text").value = p.state || "";
    if ($("#profession_detail_select").value !== (p.profession_detail || "")) $("#profession_detail_select").value = "";
    if ($("#state_select").value !== (p.state || "")) $("#state_select").value = "";

    // An institution from the user's college sign-in: fixed when the college
    // is configured with lock_organisation, otherwise just a suggestion.
    const inst = data.institution;
    const note = $("#institution-note");
    if (inst && inst.locked) {
      instInput.value = inst.name;
      instCode.value = inst.aishe_code || "";
      instInput.readOnly = true;
      note.textContent = "Your institution is set by the account you signed in with.";
      note.hidden = false;
    } else if (inst && !p.institution_name) {
      instInput.value = inst.name;
      instCode.value = inst.aishe_code || "";
      note.textContent = "We've filled in your institution from your email address. Change it if it's wrong.";
      note.hidden = false;
    }
    showCode();

    if (data.complete) {
      $("#title").textContent = "Your profile";
      $("#intro").textContent = "Keep your details up to date.";
      $("#save").textContent = next ? "Save and continue" : "Save changes";
    } else {
      $("#title").textContent = "Complete your registration";
      $("#intro").textContent =
        "Welcome" + (data.name ? ", " + data.name.split(/\s+/)[0] : "") + "! Tell us a little about yourself. You only need to do this once.";
    }
  }

  function collect() {
    const val = (id) => $("#" + id).value;
    const profession = val("profession");
    return {
      name: val("name"),
      gender: val("gender"),
      gender_self_describe: val("gender_self_describe"),
      age_group: val("age_group"),
      profession,
      profession_detail: options.profession_details[profession] ? val("profession_detail_select") : val("profession_detail_text"),
      social_category: val("social_category"),
      referral_source: val("referral_source"),
      referral_source_other: val("referral_source_other"),
      referral_code: val("referral_code"),
      country: val("country"),
      pin_code: val("pin_code"),
      state: india() ? val("state_select") : val("state_text"),
      institution_name: val("institution_name"),
      institution_aishe_code: val("institution_aishe_code"),
      degree_level: val("degree_level"),
      discipline: val("discipline"),
      discipline_other: val("discipline_other"),
      graduation_year: Number(val("graduation_year")) || 0,
      analytics_consent: $("#analytics_consent").checked,
    };
  }

  form.addEventListener("change", sync);

  // ---- Institution: suggestions from the AISHE directory while typing ------
  //
  // Picking a suggestion stores its AISHE code; anything else is kept as
  // typed. When nothing matches, the only option is the typed name itself.

  const instInput = $("#institution_name");
  const instCode = $("#institution_aishe_code");
  const instList = $("#institution-options");
  let suggestions = []; // {aishe_code, name, state, district} or {typed}
  let active = -1;
  let timer = 0;
  let requestSeq = 0;

  function showCode() {
    $("#institution-hint").textContent = instCode.value
      ? "AISHE code " + instCode.value
      : "Start typing to see suggestions. Not listed? Just type its full name.";
  }

  function closeSuggestions() {
    instList.hidden = true;
    instInput.setAttribute("aria-expanded", "false");
    instInput.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function highlight(i) {
    active = i;
    Array.from(instList.children).forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    instInput.setAttribute("aria-activedescendant", instList.children[i].id);
    instList.children[i].scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const s = suggestions[i];
    instInput.value = s.typed || s.name;
    instCode.value = s.typed ? "" : s.aishe_code;
    showCode();
    closeSuggestions();
  }

  function renderSuggestions() {
    instList.replaceChildren(
      ...suggestions.map((s, i) => {
        const li = document.createElement("li");
        li.id = "institution-option-" + i;
        li.className = "vl-combo-option";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        const name = document.createElement("span");
        name.className = "vl-combo-name";
        name.textContent = s.typed || s.name;
        const meta = document.createElement("span");
        meta.className = "vl-combo-meta";
        meta.textContent = s.typed ? "Not in the list: use this name" : [s.district, s.state].filter(Boolean).join(", ");
        li.append(name, meta);
        // mousedown, not click: it fires before the input loses focus.
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          choose(i);
        });
        return li;
      })
    );
    active = -1;
    instList.hidden = false;
    instInput.setAttribute("aria-expanded", "true");
  }

  async function suggest() {
    const q = instInput.value.trim();
    const seq = ++requestSeq;
    if (q.length < 2 || instInput.readOnly) {
      closeSuggestions();
      return;
    }
    const params = new URLSearchParams({ q, limit: "8" });
    if (india() && $("#state_select").value) params.set("state", $("#state_select").value);
    let found = [];
    try {
      found = (await api("GET", "/api/v1/institutions?" + params)).institutions;
    } catch {
      // Suggestions are a convenience; a typed name still works.
    }
    // A newer keystroke has taken over, or the user has moved on.
    if (seq !== requestSeq || document.activeElement !== instInput) return;
    suggestions = found.length ? found : [{ typed: q }];
    renderSuggestions();
  }

  instInput.addEventListener("input", () => {
    instCode.value = ""; // edited, so no longer the picked institution
    showCode();
    clearTimeout(timer);
    timer = setTimeout(suggest, 150);
  });

  instInput.addEventListener("keydown", (e) => {
    if (instList.hidden) {
      if (e.key === "ArrowDown") suggest();
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        highlight((active + 1) % suggestions.length);
        break;
      case "ArrowUp":
        highlight(active <= 0 ? suggestions.length - 1 : active - 1);
        break;
      case "Enter":
        if (active >= 0) choose(active);
        else closeSuggestions();
        break;
      case "Escape":
        closeSuggestions();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  instInput.addEventListener("blur", closeSuggestions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = $("#save");
    Forms.clearErrors(form);
    Forms.hideAlert(alertEl);
    Forms.busy(button, true);
    let data;
    try {
      data = await api("PUT", "/api/v1/profile", collect());
    } catch (err) {
      Forms.busy(button, false);
      if (err.code === "unauthenticated") location.assign(VlabsAuth.loginUrl());
      else Forms.handleError(err, form, alertEl);
      return;
    }
    VlabsAuth.clearReferralCode(); // registration done; the code is in the profile now
    if (next) {
      location.assign(next);
      return;
    }
    Forms.busy(button, false);
    load(data);
    VlabsAuth.refreshHeader();
    Forms.showAlert(alertEl, "Your profile has been saved.", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  async function init() {
    let data;
    try {
      [options, data] = await Promise.all([api("GET", "/api/v1/profile/options"), api("GET", "/api/v1/profile")]);
    } catch (err) {
      if (err.code === "unauthenticated") {
        location.replace(VlabsAuth.loginUrl());
        return;
      }
      $("#loading").hidden = true;
      Forms.showAlert(alertEl, Forms.message(err));
      return;
    }
    form.querySelectorAll("select[data-options]").forEach((s) => fill(s, options[s.dataset.options]));
    const years = [];
    for (let y = options.graduation_year_max; y >= options.graduation_year_min; y--) years.push({ value: String(y), label: String(y) });
    fill($("#graduation_year"), years);
    load(data);
    $("#loading").hidden = true;
    form.hidden = false;
  }

  init();
})();
