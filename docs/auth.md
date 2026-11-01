# Virtual Labs sign-in

Lab and experiment builds include Virtual Labs sign-in, backed by the auth
service ([tool-virtual-labs-auth-analytics-iiith](https://github.com/virtual-labs/tool-virtual-labs-auth-analytics-iiith)).

## What a build gets

- **Every page:** a **Sign in** button in the header. Once the user signs in,
  it becomes an account menu with *My profile* and *Sign out*. Until the
  registration form is saved, the menu also shows *Complete your
  registration*. Simulation pages have no header, but they still load the
  client.
- **`login.html` and `profile.html`:** written at the root of every build,
  the lab's and each experiment's.
  - `login.html` is email-first sign-in. It covers passwords, Google /
    Microsoft / institution sign-in, email verification for new accounts,
    and password reset.
  - `profile.html` is the registration form. Its institution field suggests
    names from the AISHE directory while the user types.
- **Shared session:** users sign in once for every lab and experiment. The
  session cookie belongs to `vlabs.ac.in`.
- **Referral links:** any page opened with `?ref=CODE` remembers the code for
  30 days, across labs. The code fills in the referral code on the
  registration form.

After signing in, users go back to the page they started from. New accounts
fill in the registration form first.

## Files

| File | Purpose |
|---|---|
| `assets/js/vlabs-auth.js` | API client, header widget, referral codes; loaded on every page |
| `assets/js/vlabs-auth-login.js`, `assets/js/vlabs-auth-profile.js`, `assets/js/vlabs-auth-forms.js` | the two pages |
| `assets/css/vlabs-auth.css` | styles, on top of `vlabs-style.css` |
| `auth/templates/` | `login.html` / `profile.html` templates, written by `auth/auth_pages.js` |
| `lab_build/page-templates/auth-head.handlebars` | lab pages: settings, stylesheet and script |
| `lab_build/skeleton.html` | lab pages: the header slot (`data-vlabs-auth`) |
| `exp_build/templates/partials/commons.handlebars`, `header.handlebars` | experiment pages: the same |

## Settings

The pages read their settings from `<meta>` tags, which the build writes:

| Meta tag | Value |
|---|---|
| `vlabs-auth-pages` | directory of `login.html` / `profile.html`, relative to the page |
| `vlabs-auth-home` | where to go after signing in when no page was given (`Introduction.html` for labs, `index.html` for experiments) |
| `vlabs-auth-api` | the auth service, only when `VLAB_AUTH_API` is set |

How a build chooses the auth service:

- **By default:** pages on `*.vlabs.ac.in` use `https://auth.vlabs.ac.in`.
  Pages anywhere else use port 8080 of their own host, which is the auth
  service's local setup.
- **`VLAB_AUTH_API` environment variable:** set it to build against another
  auth service, e.g. `VLAB_AUTH_API=https://auth-test.vlabs.ac.in`.
- **`--disableAuth`:** leaves sign-in out of a build entirely.

The auth service must allow the pages' origin: `frontend.allowed_domains`
covers `*.vlabs.ac.in`.

## Trying it locally

1. **Run the auth service.** Follow its README (`docker compose up -d`, then
   `go run ./cmd/vlabs-auth`). It serves `http://localhost:8080`, and its
   development config allows pages from `http://localhost:5500`.
2. **Build a lab with local links to its experiments.** Use Node 18–22; the
   build fails on Node 25 and later.

   ```sh
   node main.js buildLab --env=local --disablePlugin --src=../lab-5g-core-dei
   ```

3. **Serve the build on port 5500.** Open
   `http://localhost:5500/Introduction.html`, using `localhost` and not
   `127.0.0.1`.

   ```sh
   python -m http.server 5500 --directory ../lab-5g-core-dei/build
   ```

Sign-up emails go to the auth service's Mailpit at `http://localhost:8025`.
