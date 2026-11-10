# Prayer Times — Sayyid Fadlallah's Office

A static, installable (PWA) web app showing prayer times as calculated by the
office of Sayyid Mohammad Hussein Fadlallah (data sourced live from
[fadlullah.org.lb/prayer-time](https://www.fadlullah.org.lb/prayer-time)).

## Run locally

```
npm start
```
Then open http://localhost:8787

(No build step — it's plain HTML/CSS/JS. Any static file server works.)

## Features
- Live prayer times in a 3x3 tile grid (Imsak, Fajr, Sunrise, Dhuhr, Asr, Maghrib, End of Twilight, Isha, Midnight)
- Countdown + progress bar to the next marker, current-marker highlight — works across the Imsak/Midnight day boundary by pre-fetching yesterday/tomorrow in the background
- City picker (2300+ cities worldwide, same list as the source site, with search) or device geolocation
- Arabic / English toggle, Hijri (from the office's own calculation) + Gregorian date
- Day navigation (prev/next/today)
- Installable on iOS/Android home screen (Add to Home Screen) via the web app manifest + service worker — works offline for the UI shell, times still require network.

## Notes on data source
The app calls the same public, CORS-enabled endpoint the official site's
widget uses (`webservices/MawakitAlSalatWebService.ashx`) directly from the
browser — no backend/proxy needed. `data/countries.json` is a one-time
snapshot of the site's city list; regenerate it if the source site adds
cities (see git history of this file for the fetch/parse approach).

## Turning this into an iOS app later
1. **Easiest — PWA (already done):** open the site in Safari on iPhone →
   Share → "Add to Home Screen". It installs with its own icon and runs
   full-screen, no App Store needed.
2. **Native App Store app:** wrap this same code with
   [Capacitor](https://capacitorinfo.dev) (`npx cap init`, `npx cap add ios`)
   to get a real .ipa without rewriting the UI.
