# Open items

Capture first, decide later.

## Next up
- [ ] Play it on the phone for real and tune difficulty (`BASE_SPEED`, `SPEEDUP` in js/dodge.js)
      and the default baseline numbers (`POPULATION_BASELINE` in js/scoring.js).
- [ ] Do 3+ calibration runs on different days; see if scores are stable enough day to day.

## Ideas
- Game-first features: personal best, streaks, a "just play" mode that doesn't save a check.
- More test types: divided attention (dodge + react to a sign), balance/tremor using the
  phone's motion sensor, a short memory or tracking task.
- Show the check's raw trend over time (chart in History).
- Wrap with Capacitor for Play Store / App Store.
- Check that a sound plays on iPhone (Safari audio rules).

## Car side (later, maybe with a new car radio)
- Most cars can't be software-slowed. See docs/car-integration.md.
- Cheapest real option: set the car's built-in adjustable speed limiter (if it has one) to the app's cap.
- An Android-based head unit could run this app on the dash, but still can't limit speed.
- Hobby route: comma.ai openpilot / sunnypilot on a supported car.

## Known issues
- Overpass speed-limit lookups fail sometimes; consider a paid speed-limit API if drive mode matters.
- Nearest-road matching can pick the wrong road at overpasses or frontage roads (no heading check yet).
