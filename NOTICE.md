# Attributions

The code in this project is published under the terms of [LICENSE](LICENSE):
readable by anyone, reusable only with written permission from Skudo. This
document is about something else: the work derived from three free
extensions and data taken from a project shared by password managers. None
of those licenses require us to publish our own code; all of them require
the copyright notice to travel with the distributed package, which is what
this file does.

## Firefox Relay, Mozilla Public License 2.0

<https://github.com/mozilla/fx-private-relay-add-on>

The detection model weights in `src/detector/signals.js`
(`attrsMatchEmailExactly`, `placeholderMatchesEmail`, `labelMatchesEmail`,
and the starting constant) are the ones learned by Mozilla's Fathom model,
trained on a set of real hand-labeled forms. They're carried over to the
digit. The Fathom library itself is not included: the weighted sum and
sigmoid are rewritten, since 2,739 lines of library for four signals isn't
justified.

## DuckDuckGo Autofill, Apache License 2.0

<https://github.com/duckduckgo/duckduckgo-autofill>

The exclusions in `src/detector/exclusions.js` mirror their own field
recognition configuration: search boxes, filters, "subject" fields, discount
codes. The signed scoring setup in `src/detector/form-intent.js`, with the
submit button's text as the dominant signal, comes from their
`FormAnalyzer.js`. The code is rewritten; the weights are ours.

## addy.io browser extension, MIT

<https://github.com/anonaddy/browser-extension>

Copyright (c) 2019 addy.io

The minimum-size thresholds against honeypot fields and the icon placement
criteria are derived from their `content.js`.

## Password Manager Resources, MIT

<https://github.com/apple/password-manager-resources>

Copyright (c) 2020 - 2026 Apple Inc.

`src/shared/related-sites.js` is generated from two of their data files
(`quirks/shared-credentials.json` and
`quirks/websites-that-ask-for-credentials-for-other-services-when-embedded-as-third-party.json`)
via `scripts/related-sites.mjs`. The first says which domains share the same
account, so an alias created on safeway.com is also found on vons.com; the
second says inside which third-party frames it doesn't make sense to suggest
anything. The data is theirs; the compact format and the code that reads it
are ours.

The project asks, without requiring it, that any corrections found be
contributed back: if we discover a missing domain group, an issue should be
opened there.

---

The full license texts need to be included in `dist/` before publishing on
the stores.
