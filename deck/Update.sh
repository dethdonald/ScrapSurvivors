#!/bin/bash
# Scrap Survivors updater - checks GitHub and downloads a newer version WITHOUT opening the game.
# Run this directly (double-click it, or `./Update.sh` in a terminal) any time you just want to update,
# or to see exactly why an update isn't landing - it prints what happened instead of only logging it quietly.
# Same update as ScrapSurvivors.sh does automatically every time you launch the game; this just does it alone.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/resources/app"
REPO="dethdonald/ScrapSurvivors"
LOG="$HERE/update-log.txt"
source "$HERE/update-lib.sh"

echo "Scrap Survivors updater"
echo "Current version: $(cat "$APP/VERSION" 2>/dev/null || echo 'unknown')"
[ -f "$HERE/github-token.txt" ] && echo "github-token.txt: found" || echo "github-token.txt: NOT found (this repo is private, so without a token the update check will fail)"
echo "Checking GitHub for an update..."
update

case "$UPD_RESULT" in
  current)
    echo "You're already on the latest version."
    ;;
  updated:*)
    echo "Updated to ${UPD_RESULT#updated:}. Launch the game normally to play it."
    ;;
  offline)
    echo "Couldn't reach GitHub at all. Check your internet connection and try again."
    ;;
  failed:*)
    echo "Update failed: ${UPD_RESULT#failed:}"
    echo "See $LOG for details."
    ;;
  *)
    echo "Unexpected result: ${UPD_RESULT:-<none>}"
    ;;
esac

echo
read -r -p "Press Enter to close..." _ 2>/dev/null
