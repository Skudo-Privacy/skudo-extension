<div align="center">

<img src="src/assets/img/icon_128.png" width="96" height="96" alt="Skudo" />

# Skudo

**Create an email alias instead of giving out your real address.**

[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-green)](src/manifest.json)
[![Firefox](https://img.shields.io/badge/firefox-128%2B-orange)](src/manifest.json)
[![Chrome](https://img.shields.io/badge/chrome-supported-yellow)](src/manifest.json)

[Website](https://skudo.org) · [Report an issue](https://github.com/Skudo-Privacy/skudo-extension/issues)

</div>

---

## What is Skudo

Skudo is a browser extension that generates a unique email alias for every
site you sign up on, right from the field you're typing into. Mail sent to
that alias reaches your real inbox; the site never sees your real address.
If a service ever leaks or sells its list, you know exactly who to blame,
and you can shut that one address off without touching anything else.

## Features

- **Signup, not login.** Skudo tells the two apart. On a login form it
  offers the alias you already have for that site instead of minting a new
  one, so you're never locked out of your own account by a fresh address
  with no history.
- **One alias per site, per session.** Pressing the icon twice never
  produces two addresses for the same signup.
- **Shared-account awareness.** An alias created on one site is recognized
  on the sites that share its login, so you don't end up with duplicates
  across a company's related domains.
- **Private by construction.** Site icons are proxied through Skudo's own
  infrastructure instead of being requested from each site directly, so no
  site ever learns that its icon was fetched, let alone by whom.
- **One-click connect.** Signing in from the extension takes one click and
  a visual code check, no API key to copy and paste anywhere.
- **Small.** The whole package is under 100&nbsp;KB. The content script runs
  on every page you open, so its size is a requirement, not an afterthought.
- **Source-available.** The full source is here to read, audit, and verify
  against what actually ships. See [License](#license).

## Installation

Skudo isn't listed on the extension stores yet. Until it is, build it
yourself:

```
git clone https://github.com/Skudo-Privacy/skudo-extension.git
cd skudo-extension
npm install
npm run build
```

Then load the `dist/` folder as a temporary or unpacked extension:

| Browser | Steps |
|---|---|
| Firefox | `about:debugging` → This Firefox → Load Temporary Add-on → pick `dist/manifest.json` |
| Chrome | `chrome://extensions` → Developer mode → Load unpacked → pick the `dist/` folder |

## How it works

1. Skudo watches for email fields as you type, and tells a signup form
   apart from a login form before doing anything.
2. On a signup, it offers to generate a fresh alias in place.
3. Mail sent to that alias forwards straight to your real inbox.
4. From the popup, you can rename, pause, or delete any alias at any time.

## Privacy and security

- The extension has **no access to any site** at install time. Reading
  page content to draw the in-field icon is an opt-in permission, requested
  only after you turn that feature on.
- Your access token never leaves the extension's background context. The
  script running inside a page never sees it.
- Your forwarding address is never requested by, or exposed to, the
  extension in any form.
- Alias creation is rate-limited on both the client and the server, so a
  stray double-click can't silently produce a handful of orphaned aliases.

## Development

```
npm install
npm test          # runs the test suite
npm run build      # builds dist/
npm run dev        # rebuilds on every save
npm run lint       # Mozilla's own review checker
npm run firefox    # opens Firefox with the extension loaded
npm run pack       # produces the upload-ready zip
npm run format
```

## Contributing

Bug reports, detection edge cases, and pull requests are welcome. If you've
found a form Skudo gets wrong, a fixture in `test/detector/fixtures`
reproducing it is worth more than a description of it.

By submitting a contribution, you agree it can be included in the project
under the same terms as [LICENSE](LICENSE).

## Roadmap

- [ ] Real-world form captures to calibrate the detector further
- [ ] Testing across Mullvad Browser and LibreWolf
- [ ] Firefox Add-ons and Chrome Web Store listings
- [ ] Reproducible, verifiable builds

## License

The source is readable by anyone, right here. It isn't open source: reusing
any part of it requires prior written permission from Skudo. See
[LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for the credits owed to the
third-party research this project builds on.

---

<div align="center">

Made by [Skudo](https://skudo.org)

</div>
