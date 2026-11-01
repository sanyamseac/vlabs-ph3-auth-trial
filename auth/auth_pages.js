// Renders the Virtual Labs sign-in pages, login.html and profile.html, into
// a lab or experiment build. See docs/auth.md.
const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const log = require("../logger.js");

const templateDir = path.resolve(__dirname, "templates");

/*
  writeAuthPages writes login.html and profile.html into dir, the root of a
  build. data:
    prefix     path from dir to the assets: "" for a lab, "assets/" for an
               experiment
    site_name  the lab or experiment users are signing in to
    home       page to land on after signing in, relative to dir
    auth_api   auth service URL, if not the default (VLAB_AUTH_API)
*/
function writeAuthPages(dir, data) {
  // A separate instance, so these partials don't clash with the
  // experiment's.
  const hb = Handlebars.create();
  ["head", "header", "footer"].forEach((name) => {
    hb.registerPartial(name, fs.readFileSync(path.join(templateDir, "partials", `${name}.handlebars`), "utf-8"));
  });
  [
    ["login", { ...data, account_menu: false }],
    ["profile", { ...data, account_menu: true }],
  ].forEach(([page, pageData]) => {
    const template = fs.readFileSync(path.join(templateDir, `${page}.handlebars`), "utf-8");
    fs.writeFileSync(path.join(dir, `${page}.html`), hb.compile(template)(pageData), "utf-8");
  });
  log.debug(`Wrote login.html and profile.html to ${dir}`);
}

module.exports = { writeAuthPages };
