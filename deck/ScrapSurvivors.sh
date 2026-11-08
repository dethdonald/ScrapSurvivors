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
# Steam preloads its overlay (gameoverlayrenderer.so) into every game via LD_PRELOAD. A 0.43.13 Gaming Mode
# test once suggested keeping it was required there - but real testing on 0.43.15/16 showed the opposite in
# BOTH Gaming Mode and Desktop Mode: the game only boots once LD_PRELOAD is cleared (confirmed via the
# LD_PRELOAD="" %command% Launch Option override in both modes; turning the overlay off in Steam's own
# settings did NOT have the same effect, so clearing it here ourselves is the only thing that reliably works).
# So: always clear it. If Gaming Mode ever regresses because of this, it was never really about gamescope
# needing the overlay - something else was going on in that first 0.43.13 test.
unset LD_PRELOAD
# Gaming Mode runs games under gamescope (Xwayland): ask Electron for plain X11 explicitly. Desktop Mode is
# whatever the desktop session actually is (usually also X11 on the Deck's Plasma), so this is harmless there too.
FLAGS=(--no-sandbox --ozone-platform=x11)
LAUNCH_LOG="$HERE/launch-log.txt"
{ echo "=== $(date) start: $*"; echo "SteamDeck=${SteamDeck:-} SteamAppId=${SteamAppId:-} DISPLAY=${DISPLAY:-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-} XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-} XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-} XDG_SESSION_DESKTOP=${XDG_SESSION_DESKTOP:-}"; echo "LD_PRELOAD cleared (always, now)"; } > "$LAUNCH_LOG"
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
