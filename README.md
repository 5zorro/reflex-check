# Reflex Check

A phone game that works like a "breathalyzer" for reaction time. 

It would be annoying as hell, but applying the categorical imperative to driving (if everyone 
used this then I could trust that my fellow drivers were competent when they started the car).
It would be like SSO which is currently used to annoy everyone but keep hacks down.

My vision for this app: It is a game, and if you hook it up to a car with software/hardware, 
then this could act like a objective external "you are dangerous, but still can use your car
X% kind of device".

As only the "phone game" part is developed, ill describe that: 
1 Take a one-minute check (establishes sober baseline and/or compares against sober baseline). 
 - Minigame 1 is "reaction tap"
 - Minigame 2 is "avoid the shapes and the walls for as long as you can"
2 The app gives you a score highlighting how well you performed related to baseline. If you're 
far off your normal, it tells you not to drive.

It's built for anyone whose reactions might be off: older drivers, tired drivers, people prone 
to health flare ups, and people who've been drinking or using. It's based on the classic "Pilot 
Trainer" shape game ([echalk / edSLAP](https://www.edslap.com/amusements/Games/pilotTrainer/pilotTrainer.html)).

> **Not a medical or legal device.** It can't detect alcohol or drugs. A good score
> never means you're safe or legal to drive. The design is one-way: it can tell you
> *not* to drive, but it can never clear you to drive.

The idea is that a user is used to **their baseline**. A teenager has reaction and to spare, but
has not the experience to have good judgement of road hazards as someone who is 60 years old. The
60 year old has less reaction time, but has the judgement to make up the difference.

## What's in a check (~1 minute)

1. **Reaction test.** The screen turns green after a random delay. Tap as fast as you can, 5 times.
   Tapping early counts as a false start and costs points.
2. **Dodge game, 2 rounds.** Drag anywhere on the screen to steer the red square. Avoid the blue
   blocks and the black wall. The blocks speed up. Your score is how long you survive.

## How the score becomes a speed cap

First you **calibrate**: do at least 3 checks while rested and sober (on different days is best).
Your baseline is the median of your last 5 calibration runs. Until then, the app compares you
to typical adult numbers.

Score = 100 means "exactly your normal." Half the score comes from reaction time, half from the dodge game.

| Score | Meaning | Speed cap |
|---|---|---|
| 110+ | Sharper than usual | Posted limit |
| 95–109 | Your normal | 5 mph under |
| 85–94 | Slower than usual | 10 mph under |
| 75–84 | Much slower | 15 mph under |
| under 75 | Far off | **Don't drive** |

The app never suggests going *over* the posted limit, even with a great score. A check stays
valid for 2 hours by default (changeable in Settings), then drive mode asks for a new one.

To change these numbers, edit `BANDS` in [js/scoring.js](js/scoring.js).

## Drive mode

Uses the phone's GPS for your speed and looks up the road's posted limit from
OpenStreetMap. Shows **road limit**, **your cap**, and **your speed**, which turns red with a
beep and vibration when you're over your cap. If the map has no limit for a road, use the
−5/+5 buttons to set it by hand.

A phone app can't control a car. See [docs/car-integration.md](docs/car-integration.md) for
how a real speed governor could work.

## Run it on your computer

Needs Python (already installed). From this folder:

```bash
python -m http.server 8765
```

Then open http://localhost:8765. Use a mouse to drag in the dodge game.

## Install on your phone

No app store needed. Open this link on your phone:

**https://5zorro.github.io/reflex-check/**

Then add it to your home screen:

- **Android (Chrome):** tap the menu ⋮ → **Add to Home screen** (or **Install app**) → **Install**.
- **iPhone (Safari only):** tap the Share button → **Add to Home Screen** → **Add**.

It now has its own icon, opens full-screen like a normal app, and the checks work offline.

**First time:** tap **Calibrate my baseline** and do it 3 times while rested and sober
(different days is best). Then use **Run check** whenever you want.

**Drive mode** asks for location permission the first time. Allow it, or drive mode can't
show your speed.

**Updates:** new versions download on their own the next time you open the app while online.
Your history and baseline stay on your phone and aren't affected.

**Uninstall:** remove it like any app (long-press the icon). To wipe your history first, use
Settings → **Clear all history** in the app.

### Host your own copy

The app is plain files, so any HTTPS host works (GPS and home-screen install need HTTPS):

- **GitHub Pages:** fork this repo, then Settings → Pages → Deploy from a branch → `main` / root.
- **Netlify Drop:** drag the folder onto https://app.netlify.com/drop.

To get it into the Play Store / App Store later, it could be wrapped with
[Capacitor](https://capacitorjs.com/) or packaged with [PWABuilder](https://www.pwabuilder.com/)
(see [openitems.md](openitems.md)).

## Tests

```bash
npm test
```

Runs scoring and speed-limit-parsing tests, plus a simulation where a virtual player with
slow reactions plays the dodge game, to confirm slower reactions really do score lower.
`npm run sim` prints the full table.

## Privacy

Everything stays on the phone (browser storage). The only thing sent anywhere is your
approximate location to the public OpenStreetMap Overpass service, and only in drive mode,
to look up speed limits.
