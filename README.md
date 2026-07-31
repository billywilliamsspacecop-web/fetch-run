# Fetch Run (working title)

Endless runner for iOS: a dog sprints through the backyard dodging obstacles.
Goal: on the App Store by end of August 2026.

**Stack:** vanilla HTML5/Canvas + JS, wrapped with Capacitor for iOS (Week 3).

## Run it

Open `index.html` via any static server, e.g.:

```
npx serve .
```

Desktop testing: arrow keys or number keys 1-5 to change lanes, Space/Enter to start.

## Design decisions (from planning chat, Jul 30 2026)

- 5 fixed lanes, portrait, one-thumb control
- Two control schemes built for A/B testing (toggle on start screen):
  - **Tap zones** — screen split into 5 columns, tap where you want the dog
  - **Swipe** — one lane per swipe left/right
- Chill/zen opening (~75s) then linear difficulty ramp
- Death → short pause + stat screen (skippable later for hardcore players)
- First dog is "The dog" (intentionally). Unlockable dogs with preset fun names later.
- Environments progress from backyard outward as you run farther (post-MVP)
- Near-miss "close calls" tracked now — groundwork for combo/streak multiplier (Week 3)

## Roadmap

- **Week 1:** core loop feel — pick winning control scheme, tune speed/spawn curves
- **Week 2:** art pass (Bryce draws sprites from reference board), juice, sound
- **Week 3:** selling points (combos, daily best, unlockables), Capacitor wrap, device build
- **Week 4:** icon, screenshots, TestFlight, submit (buffer for Apple review)

Tuning knobs live in `js/config.js`.
