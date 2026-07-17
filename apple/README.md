# Morrowward Apple companions

Morrowward for iPhone and Morrowward for Mac are lightweight companion shells built from one fresh SwiftUI/WebKit codebase during OpenAI Build Week. They demonstrate how Codex carried a finished, local-first web product into Apple's tooling without duplicating the deterministic financial engine or pretending these are full native rewrites.

Both apps use Apple's iOS/macOS 26 `WebPage` and SwiftUI `WebView` APIs. The Release origin is pinned to [`https://morrowward.vercel.app`](https://morrowward.vercel.app). Personal plans and practice holdings stay in each app's private persistent WebKit store; they do not automatically sync with Safari or with the other companion app.

## Requirements

- macOS 26
- Xcode 26
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) 2.45 or newer when regenerating the project
- iOS 26 simulator for the iPhone target

No OpenAI key, Vercel credential, brokerage connection, or signing identity is needed to run the companion shells against Production.

## Generate the Xcode project

`project.yml` is the source of truth:

```bash
cd apple
xcodegen generate
open MorrowwardApple.xcodeproj
```

The generated project is included so a judge can open it directly. Regenerate it after changing targets, resources, build settings, Info.plist values, or entitlements.

## iPhone simulator

Choose the **Morrowward-iOS** scheme and an iPhone running iOS 26, then Run in Xcode. The command-line equivalent is:

```bash
xcodebuild \
  -project MorrowwardApple.xcodeproj \
  -scheme Morrowward-iOS \
  -configuration Release \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

A physical iPhone is optional. To install there, select your own Apple development team and let Xcode replace the local bundle signing configuration; no paid distribution or App Store setup is required for the hackathon demo.

## Unsigned local Mac build

Choose **Morrowward-macOS** and Run in Xcode, or build without a signing identity:

```bash
xcodebuild \
  -project MorrowwardApple.xcodeproj \
  -scheme Morrowward-macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

Run the native origin-policy and backup-payload unit tests with:

```bash
xcodebuild \
  -project MorrowwardApple.xcodeproj \
  -scheme Morrowward-macOS \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  -only-testing:MorrowwardTests \
  test
```

The **Morrowward-macOS** scheme also contains the Mac production-persistence UI test. The **Morrowward-iOS** scheme contains the matching iPhone journey:

```bash
xcodebuild \
  -project MorrowwardApple.xcodeproj \
  -scheme Morrowward-iOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:MorrowwardIOSUITests \
  test
```

Run the Mac production-persistence UI journey with:

```bash
xcodebuild \
  -project MorrowwardApple.xcodeproj \
  -scheme Morrowward-macOS \
  -destination 'platform=macOS' \
  -only-testing:MorrowwardMacUITests \
  test
```

## Verified July 17 runtime evidence

- The iOS Release target compiled and launched against Production in an iPhone 17 Pro Simulator.
- The iPhone production UI journey passed 1/1: it reached Today, terminated the app, relaunched it, and confirmed the local plan remained while onboarding did not return.
- The Mac Release compiled, launched with an ad-hoc signature, passed strict signature verification, and contained the expected App Sandbox, network-client, and user-selected read/write entitlements.
- The Mac production UI journey passed 1/1 and proved its local plan survived complete app termination and relaunch.
- The native suite passed 7/7 unit tests covering exact-origin and lookalike rejection, Debug-origin bounds, trusted backup blobs, backup decoding, filename sanitization, malformed input, and size limits.

The runtime captures are stored at [`docs/screenshots/morrowward-iphone-companion.png`](../docs/screenshots/morrowward-iphone-companion.png) and [`docs/screenshots/morrowward-mac-companion.png`](../docs/screenshots/morrowward-mac-companion.png).

## Optional local web server in Debug

Debug builds still default to the stable Production origin so the demo has one backend and one source of truth. A developer can explicitly point a Debug run at the repository's local server through the Xcode scheme environment:

```text
MORROWWARD_ORIGIN=http://127.0.0.1:4189
```

Alternatively add the launch arguments `--morrowward-origin http://127.0.0.1:4189`. Overrides are accepted only for the stable Production host, `localhost`, or `127.0.0.1`; Release builds ignore them. Arbitrary insecure loads are not enabled.

## Security and privacy boundaries

- Only the exact configured Morrowward origin stays inside the shell. Lookalike hosts, HTTPS downgrades, other ports, external redirects, and unknown schemes are canceled.
- User-activated external HTTP(S) educational links open in the system browser.
- The persistent default WebKit store preserves IndexedDB plans, practice holdings, cached briefings, and service-worker state across launches.
- Camera, microphone, motion, and device-sensor permission requests are denied.
- The Mac target is configured for App Sandbox when signed, with outbound network access plus user-selected read/write access for explicit backup export and import. The documented no-identity build is for local compilation and launch verification; it does not apply signing entitlements.
- The privacy manifest declares no native tracking or collected-data behavior.
- No API key is embedded. OpenAI calls remain protected by the same server-side endpoints used by the web app.

After a successful online load, each shell reuses the web app's service worker and deterministic degraded/offline design rather than adding a second native implementation. A small native bridge turns the web app's JSON backup blob into Apple's standard save panel because SwiftUI `WebView` does not expose a download delegate. Import continues through WebKit's system file-input panel. Local persistence is runtime-verified on both platforms; export/import panels, historical video playback, external-link handoff, warmed offline reload, keyboard use, Reduce Motion, and VoiceOver remain explicit hands-on smoke checks because integration deserves runtime proof beyond a successful compile.
