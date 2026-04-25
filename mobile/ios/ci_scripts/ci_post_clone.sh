#!/bin/sh
set -e

# Xcode Cloud runs this after checkout. We need to install Flutter and
# pre-build the Dart artifacts so the Runner.xcworkspace can archive cleanly.

echo "→ Installing Flutter via fvm-style clone (faster than brew on CI)"
git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$HOME/flutter"
export PATH="$HOME/flutter/bin:$PATH"
flutter --version
flutter precache --ios

cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# pubspec.yaml declares .env as an asset (gitignored locally). On CI all values
# come from --dart-define below, so a stub keeps the asset bundler happy.
echo "→ Creating stub .env"
touch .env

echo "→ flutter pub get"
flutter pub get

echo "→ flutter build ios --release --no-codesign"
flutter build ios --release --no-codesign \
  --dart-define=API_BASE_URL="$API_BASE_URL" \
  --dart-define=CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" \
  --dart-define=REVENUECAT_API_KEY="$REVENUECAT_API_KEY"

echo "→ pod install"
cd ios
pod install

echo "✓ ci_post_clone done"
