#!/bin/bash
# Scrap Survivors launcher for Steam Deck / Linux.
#  - Checks GitHub for a newer version of the game files and swaps them in (about 1 MB; saves are never touched).
#    No internet or GitHub down? It just starts the version it already has.
#  - --no-sandbox: Chromium's sandbox helper needs root permissions that an extracted folder doesn't have.
#  - Launched from Steam it goes fullscreen with the Deck layout on its own.
#  - Every launch is logged to launch-log.txt next to this script (send it to Claude if the game won't start).
#  - Private repo? Put a read-only GitHub token in github-token.txt next to this script (never share that file).
#  - Want to update WITHOUT opening the game (e.g. to check if an update actually landed)? Run Update.sh instead.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/resources/app"
REPO="dethdonald/ScrapSurvivors"
LOG="$HERE/update-log.txt"
source "$HERE/update-lib.sh"

[ "$1" = "--no-update" ] && shift || update
# NOTE: don't unset LD_PRELOAD here. Steam's overlay library (gameoverlayrenderer.so) is how Gaming Mode's compositor
# recognises the game's window; without it Steam sits on its loading screen forever (tried in 0.43.13).
# Gaming Mode runs games under gamescope (Xwayland): ask Electron for plain X11 explicitly.
FLAGS=(--no-sandbox --ozone-platform=x11)
LAUNCH_LOG="$HERE/launch-log.txt"
{ echo "=== $(date) start: $*"; echo "SteamDeck=${SteamDeck:-} SteamAppId=${SteamAppId:-} DISPLAY=${DISPLAY:-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-} XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"; echo "LD_PRELOAD=${LD_PRELOAD:-}"; } > "$LAUNCH_LOG"
start=$(date +%s)
"$HERE/ScrapSurvivors" "${FLAGS[@]}" "$@" >> "$LAUNCH_LOG" 2>&1
code=$?
# died within a few seconds (usually the GPU process failing under the compositor)? try once more with the GPU in-process
if [ $code -ne 0 ] && [ $(( $(date +%s) - start )) -lt 10 ]; then
  echo "=== exited with $code after $(( $(date +%s) - start ))s, retrying with --disable-gpu-sandbox --in-process-gpu" >> "$LAUNCH_LOG"
  "$HERE/ScrapSurvivors" "${FLAGS[@]}" --disable-gpu-sandbox --in-process-gpu "$@" >> "$LAUNCH_LOG" 2>&1
  code=$?
fi
echo "=== exit $code" >> "$LAUNCH_LOG"
exit $code
