// Form helpers shared by login.html and profile.html: alerts, per-field
// errors from the API's 422 responses, busy buttons and password toggles.
(function () {
  "use strict";

  function duration(seconds) {
    if (seconds >= 3600) {
      const h = Math.round(seconds / 3600);
      return h + (h === 1 ? " hour" : " hours");
    }
    const m = Math.max(1, Math.ceil(seconds / 60));
    return m + (m === 1 ? " minute" : " minutes");
  }

  function message(err) {
    if (err.code === "rate_limited" && err.retryAfter) {
      return "Too many attempts. Please try again in " + duration(err.retryAfter) + ".";
    }
    return err.message || "Something went wrong. Please try again.";
  }

  function showAlert(alertEl, text, kind) {
    alertEl.className = "alert alert-" + (kind || "danger");
    alertEl.textContent = text;
    alertEl.hidden = false;
  }

  function hideAlert(alertEl) {
    alertEl.hidden = true;
    alertEl.textContent = "";
  }

  function visible(control) {
    return control.type !== "hidden" && !control.hidden && control.offsetParent !== null;
  }

  // The visible control for an API field name: inside [data-field=name] when
  // the page groups fields that way, else the control with that name.
  function controlFor(form, name) {
    const group = form.querySelector('[data-field="' + name + '"]');
    const candidates = group
      ? group.querySelectorAll("input, select, textarea")
      : form.querySelectorAll('[name="' + name + '"]');
    return Array.from(candidates).find(visible) || null;
  }

  function clearErrors(form) {
    form.querySelectorAll(".is-invalid").forEach((c) => c.classList.remove("is-invalid"));
    form.querySelectorAll(".invalid-feedback").forEach((f) => {
      f.textContent = "";
      f.classList.remove("d-block");
    });
  }

  // setErrors marks each field and returns the messages it couldn't place.
  function setErrors(form, fields) {
    const unplaced = [];
    let first = null;
    for (const [name, text] of Object.entries(fields)) {
      const control = controlFor(form, name);
      const feedback = control && control.closest("[data-field], .form-group").querySelector(".invalid-feedback");
      if (!feedback) {
        unplaced.push(text);
        continue;
      }
      control.classList.add("is-invalid");
      feedback.textContent = text;
      feedback.classList.add("d-block");
      first = first || control;
    }
    if (first) first.focus();
    return unplaced;
  }

  // handleError shows an API error: next to the fields it names, otherwise in
  // the alert. codeFields maps error codes that belong to one field, e.g.
  // {invalid_credentials: "password"}.
  function handleError(err, form, alertEl, codeFields) {
    if (!err.code) {
      console.error(err);
      showAlert(alertEl, "Something went wrong. Please try again.");
      return;
    }
    let fields = err.fields || {};
    if (codeFields && codeFields[err.code]) fields = { [codeFields[err.code]]: message(err) };
    const unplaced = form && Object.keys(fields).length ? setErrors(form, fields) : [message(err)];
    if (unplaced.length) showAlert(alertEl, unplaced.join(" "));
  }

  function busy(button, on) {
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Please wait…';
    } else if (button.dataset.label !== undefined) {
      button.disabled = false;
      button.innerHTML = button.dataset.label;
      delete button.dataset.label;
    }
  }

  // Editing a field clears its error.
  function clearField(e) {
    const control = e.target;
    if (!control.classList || !control.classList.contains("is-invalid")) return;
    control.classList.remove("is-invalid");
    const feedback = control.closest("[data-field], .form-group").querySelector(".invalid-feedback");
    feedback.textContent = "";
    feedback.classList.remove("d-block");
  }
  document.addEventListener("input", clearField);
  document.addEventListener("change", clearField);

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle-password]");
    if (!toggle) return;
    const input = document.getElementById(toggle.dataset.togglePassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.querySelector(".fa").className = "fa " + (show ? "fa-eye-slash" : "fa-eye");
  });

  window.Forms = { duration, message, showAlert, hideAlert, clearErrors, setErrors, handleError, busy };
})();
