# BuchWelt Deployment Guide: Exporting to App Stores

This guide outlines the exact, step-by-step process required to compile, sign, and publish your Expo React Native application (**BuchWelt**) to both the Apple App Store and Google Play Store using **EAS (Expo Application Services)**.

---

## Pre-Requisites

Before you start, ensure you have:
1. Registered an **Apple Developer Account** ($99/yr) at [developer.apple.com](https://developer.apple.com).
2. Registered a **Google Play Developer Account** ($25 one-time) at [play.google.com/console](https://play.google.com/console).
3. Created an **Expo Account** (Free) at [expo.dev](https://expo.dev).

Your `app.json` has already been pre-configured with the required bundle identifiers (`com.buchwelt.app`).

---

## Phase 1: Environment Setup

Open your terminal and navigate to the project directory:
```bash
cd /Users/lasse/Documents/Coding/BuchWelt
```

**1. Install EAS CLI globally on your machine:**
```bash
npm install -g eas-cli
```

**2. Log into your Expo Account:**
```bash
eas login
```

**3. Configure EAS for the first time:**
```bash
eas build:configure
```
*Note: This will generate an `eas.json` file in your root folder. This file manages your build profiles (development vs production).*

---

## Phase 2: Building for iOS (Apple App Store)

**1. Trigger the iOS Distribution Build:**
```bash
eas build --platform ios
```

During this process:
- EAS will ask if you want to log into your Apple Developer account. Select **Yes**.
- You will be prompted to enter your Apple ID and an App-Specific Password (or standard password and 2FA).
- EAS will automatically ask if it should manage your **Distribution Certificate** and **Provisioning Profile**. Let it handle both!

*Once the build finishes on Expo's servers, you can download the generated `.ipa` file or submit it directly (Phase 4).*

---

## Phase 3: Building for Android (Google Play)

**1. Trigger the Android App Bundle Build:**
```bash
eas build --platform android
```

During this process:
- EAS will ask if you want it to generate a new **Android Keystore**. Select **Yes**.
- If prompted, let EAS securely store your keystore credentials on their servers. 
- *Warning: Never lose this Keystore. If you rebuild locally later, you must maintain the exact same keystore for updates on the Play Console.*

*Once finished, this generates an `.aab` file optimized for the Google Play Store.*

---

## Phase 4: Submitting the Binaries

You can skip manually uploading files to the developer dashboards and instead push the built binaries directly via the CLI!

**Submit to Apple TestFlight / App Store Connect:**
```bash
eas submit --platform ios
```
*You will need to provide an App Store Connect API Key (generated inside your Apple Portal) or simply log in via Apple ID when prompted.*

**Submit to Google Play Console:**
```bash
eas submit --platform android
```
*Note: For the very first Android upload, Google requires you to manually upload the `.aab` file inside the Play Console website to initialize the app. Afterward, `eas submit` will work for all future updates.*

---

## Phase 5: Publishing

1. **Apple**: Go to [App Store Connect](https://appstoreconnect.apple.com), select your app, add your screenshots, descriptions, and privacy policies, then assign the build you just uploaded. Click **Submit for Review**.
2. **Google**: Go to the [Google Play Console](https://play.google.com/console), define your store listing visuals, setup your privacy agreements, attach the uploaded `.aab` to a Production Release, and click **Roll Out to Production**.

Good luck launching BuchWelt!
