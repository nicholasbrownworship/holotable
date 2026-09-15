# HoloTable

A lightweight VTT for running FFG-style Star Wars (or Genesys-based) tabletop games —
dice pool + symbol resolution, character sheets, a zone-based scene map, and initiative,
synced live across in-person and remote players via Firebase.

## Status: v1 skeleton

What's working right now:
- Email/password sign up and login
- Create a campaign (generates a shareable join code)
- Join a campaign by code
- List of campaigns you're in, with your role (GM/Player)

What's next (in build order):
1. Wire "Enter" to real GM and player views
2. Dice pool roller + FFG symbol resolution (Boost/Setback/Ability/Difficulty/Proficiency/Challenge/Force)
3. Character sheet (flat fields: stats, skills, talents, gear)
4. Zone-based scene map with draggable tokens
5. Initiative tracker
6. Firestore security rules (currently running in test mode — this MUST happen before real use)

## Setup

1. Create a Firebase project (console.firebase.google.com), enable Email/Password auth
   and Firestore (test mode is fine for now).
2. Copy your `firebaseConfig` object from Project Settings > General > Your apps.
3. Paste it into `js/firebase-config.js`, replacing the placeholder values.
4. Push this repo to GitHub, enable GitHub Pages (Settings > Pages > deploy from branch).
5. Open the Pages URL — you should be able to sign up and create a campaign.

## Project structure

```
index.html          Login + campaign screen
css/style.css        All styling
js/firebase-config.js  Your Firebase project config (fill this in)
js/auth.js            Sign up / log in / log out / auth-state routing
js/campaigns.js       Create/join/list campaigns
```
