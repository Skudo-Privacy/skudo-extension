# Skudo browser extension

Create an email alias instead of giving out your real address.

Status: **it loads and works**. Detection, the background context, the
content script and the popup are written and tested. The scoped token exists,
with expiry and revocation. What's missing is publishing on the stores.

## Why this isn't a fork

The addy.io extension is MIT-licensed and our API is 100% compatible with it:
point it at `app.skudo.org` with a token and it works today. But out of its
4,728 lines, 3,854 are a single Vue component that would need rewriting
anyway, and two of its other choices aren't shippable for us: the API key
ends up in `storage.sync`, meaning on Google's or Mozilla's servers, and the
content script asks for `<all_urls>` at install time.

What was worth keeping is about 400 lines of knowledge about form fields,
which is carried over and credited in [NOTICE.md](NOTICE.md).

## What it does differently

**It tells a signup form apart from a login form.** None of the alias
extensions out there do this: addy.io, SimpleLogin and Firefox Relay put
their button on every email field they find. On a login form, a new alias is
actively harmful: the user types it in, can't sign in, and is left with an
address to delete. Here, on a login form, we suggest the alias that already
exists for that domain instead.

**It has a detection test corpus.** None of the three above have detection
tests. Heuristics rot on their own: someone adds an exclusion for one site
and two others silently break, with nobody to notice.

## The detector

Five layers, in order. It bails out before it starts scoring, because a
false positive costs more than a false negative: if we miss a field the user
just copies the alias by hand; if we drop one into someone's search box we've
broken their page.

| | | |
|---|---|---|
| 0 | exclusion | `exclusions.js` |
| 1 | certainty, when the site tells us directly | `index.js` |
| 2 | signal scoring | `signals.js` |
| 3 | form intent | `form-intent.js` |
| 4 | physical sanity | `visibility.js` |

The layer-2 weights marked `calibrated: true` are the ones learned by
Mozilla's own model, carried over to the digit. The most interesting result
from that model is counter-intuitive: the strongest signal isn't any
attribute of the input itself, it's the text of the associated `<label>`.

The rest are ours, hand-tuned, and due for a proper regression once the
corpus is built from real captures instead of hand-written forms modeled on
recurring patterns.

## Weight

The content script loads on every page the user opens, so weight is a
requirement, not a detail.

```
background.js    9.2 KB
content.js      19.4 KB
popup.js         8.0 KB
connect.js       1.7 KB
```

The whole package fits in 80 KB, against several hundred for comparable
extensions. Three choices make that possible: no `webextension-polyfill`
(30 KB, no longer needed since Manifest V3), no Fathom library (2,739 lines
for four signals), no `psl` (100 KB just to work out a domain's name).

## Commands

```
npm install
npm test          # 87 tests
npm run build     # produces dist/
npm run dev       # rebuilds on every save
npm run lint      # Mozilla's own check, the one AMO review runs
npm run firefox   # opens Firefox with the extension already loaded
npm run pack      # produces the zip to upload by hand
npm run format
```

`npm run lint` is the one that matters before every release: it's the exact
same check that runs during review on addons.mozilla.org, and it catches
things no unit test can.

## One site, one alias

Pressing the icon twice doesn't create two addresses. The first alias given
to a site stays the one used for the rest of that browser session, and
getting a different one requires asking for it explicitly from the panel.
Without this rule, a form with two email fields, or someone pressing the
icon again because they missed the panel, ends up with four or five aliases
for a single signup, with no way to tell which one the site actually
received.

## We don't override whoever was there first

Bitwarden, Proton Pass, 1Password and we all put our icon in the same corner
of the field, and the one underneath doesn't even get the clicks. You don't
win that by raising your z-index: you look at what's already occupying that
spot and move over. See `src/content/anchor.js`, which also covers the two
ways of claiming that corner that don't leave a findable element behind.

## What's missing

- **Real captures** for the corpus, to calibrate the hand-tuned weights.
- **Testing on real browsers**, Mullvad Browser and LibreWolf included.
- **Publishing** on the stores, and the reproducible build that has to come
  with it.

## Documents

- [NOTICE.md](NOTICE.md), where the derived work comes from

## License

The code is readable by anyone, right here on GitHub. It isn't open source:
reusing it, even in part, requires written permission from Skudo. See
[LICENSE](LICENSE).
