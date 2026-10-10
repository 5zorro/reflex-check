# Connecting the score to a car (the "governor" idea)

Goal: the car itself won't go faster than **posted limit + offset**, where the offset comes
from the latest Reflex Check (0, −5, −10, −15 mph, or "don't drive").

Short version: **a phone app can't do this alone, and you shouldn't hack the throttle.**
But there are real paths, from "works today" to "hobby research project."

## Why the phone can't just do it

- Modern cars are drive-by-wire. The engine computer decides throttle from the pedal sensor.
- The OBD-II port is a diagnostics port. It's mostly for reading data (speed, RPM, codes).
  There is no standard command for "limit top speed."
- Sending custom CAN-bus messages to override throttle is manufacturer-specific and
  safety-critical. It can cause crashes, void warranties, and may break tamper laws. Don't.
- Android Auto and Apple CarPlay only mirror the phone's screen. They can't control the car.

## Paths that exist

### 1. Advisory alerts (built now)
Drive mode beeps, vibrates, and turns red over your cap. Driver stays in control.

### 2. The car's own speed limiter (practical today)
Many cars have an **adjustable speed limiter** next to cruise control (common on European
brands, Ford's "Adjustable Speed Limiter," Mercedes "Speedtronic," and others). You set a max
speed and the car won't accelerate past it unless you floor the pedal.
**Practical use:** the app tells you your cap, you set the limiter to it. Check your owner's manual.

Some brands also have parent/teen-driver keys (e.g. Ford MyKey, GM Teen Driver) that cap top
speed. Those are fixed settings, not per-road, but they show the hardware already exists.

### 3. Intelligent Speed Assistance (ISA)
Required on new cars sold in the EU since July 2024. The car reads the speed limit from a
camera and/or map and warns, or pushes back on the gas pedal. The driver can override it. A
future version could feed a personal offset into a system like this, but today that would
take an automaker partnership.

### 4. openpilot / sunnypilot (hobbyist, real hardware)
[comma.ai](https://comma.ai)'s openpilot runs on a small device that plugs into
[supported cars](https://comma.ai/vehicles) and can control gas and brake (adaptive cruise).
The community fork **sunnypilot** has speed-limit-based set speed with a configurable offset.
A custom fork could read the Reflex Check offset (e.g. over local Wi-Fi from the phone) and
apply it. Caveats: only works while engaged; pressing the gas overrides it; only on supported
cars; not certified as a safety device.

### 5. Fleet / commercial speed limiters
Aftermarket road-speed limiters and telematics systems exist for trucks and fleets. They're
professionally installed and could take an external "max speed" input. Worth a look if a
company or family fleet were the target.

### 6. Ignition interlock (the legal precedent)
Court-ordered breath-alcohol interlocks already block starting a car. They are certified
and regulated. A reaction-time-based interlock would need research and certification
before it could be used the same way.

### 7. Possible future US rule
The 2021 Infrastructure Investment and Jobs Act (section 24220) told NHTSA to write a
standard for impaired-driving-prevention technology in new cars. As of this writing the
rulemaking was still in progress. Check its current status before relying on it.

## If you pursue path 4: suggested handoff format

The phone would publish a small signed record that the car-side device trusts:

```json
{ "offsetMph": -5, "score": 101, "takenAt": "2026-10-09T18:20:00Z", "validUntil": "2026-10-09T20:20:00Z" }
```

Car side: if the record is missing or expired, use a default (e.g. −5 or a warning). If
`offsetMph` is null, show "don't drive" and refuse to engage. Never let a record raise the cap
above the posted limit.
