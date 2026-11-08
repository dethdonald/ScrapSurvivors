#!/bin/bash
# Scrap Survivors launcher for Steam Deck / Linux.
#  - Checks GitHub for a newer version of the game files and swaps them in (about 1 MB; saves are never touched).
#    No internet or GitHub down? It just starts the version it already has.
#  - --no-sandbox: Chromium's sandbox helper needs root permissions that an extracted folder doesn't have.
#  - Launched from Steam it goes fullscreen with the Deck layout on its own.
#  - Private repo? Put a read-only GitHub token in github-token.txt next to this script (never share that file).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/resources/app"
REPO="dethdonald/ScrapSurvivors"
LOG="$HERE/update-log.txt"

update() {
  local remote local_v tmp src
  local tok="" auth=()
  [ -f "$HERE/github-token.txt" ] && tok="$(tr -d ' \r\n' < "$HERE/github-token.txt")"
  if [ -n "$tok" ]; then
    auth=(-H "Authorization: Bearer $tok")
    remote="$(curl -fsSL --max-time 5 "${auth[@]}" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/$REPO/contents/VERSION?ref=main" 2>/dev/null | head -c 64 | tr -d '\r\n')" || return 0
  else
    remote="$(curl -fsSL --max-time 5 "https://raw.githubusercontent.com/$REPO/main/VERSION?t=$(date +%s)" 2>/dev/null | head -c 64 | tr -d '\r\n')" || return 0
  fi
  [ -n "$remote" ] || return 0
  local_v="$(cat "$APP/VERSION" 2>/dev/null | tr -d '\r\n')"
  [ "$remote" = "$local_v" ] && return 0
  echo "$(date) updating $local_v -> $remote" >> "$LOG"
  tmp="$(mktemp -d)" || return 0
  local url="https://codeload.github.com/$REPO/tar.gz/refs/heads/main"
  [ -n "$tok" ] && url="https://api.github.com/repos/$REPO/tarball/main"
  if curl -fsSL --max-time 120 "${auth[@]}" "$url" -o "$tmp/u.tgz" && tar -xzf "$tmp/u.tgz" -C "$tmp"; then
    src="$(find "$tmp" -mindepth 2 -maxdepth 2 -type d -name app | head -1)"
    if [ -n "$src" ] && [ -f "$src/index.html" ] && [ -f "$src/main.js" ]; then
      rm -rf "$APP.new" "$APP.old"
      cp -r "$src" "$APP.new" && mv "$APP" "$APP.old" && mv "$APP.new" "$APP" && rm -rf "$APP.old"
      # a newer launcher (this script) comes along too; it's used from the next start
      if [ -f "$(dirname "$src")/deck/ScrapSurvivors.sh" ]; then cp "$(dirname "$src")/deck/ScrapSurvivors.sh" "$HERE/ScrapSurvivors.sh.new" && chmod +x "$HERE/ScrapSurvivors.sh.new" && mv "$HERE/ScrapSurvivors.sh.new" "$HERE/ScrapSurvivors.sh"; fi
      echo "$(date) updated to $remote" >> "$LOG"
    else
      echo "$(date) download looked wrong, kept $local_v" >> "$LOG"
    fi
  else
    echo "$(date) download failed, kept $local_v" >> "$LOG"
  fi
  rm -rf "$tmp"
}

[ "$1" = "--no-update" ] && shift || update
exec "$HERE/ScrapSurvivors" --no-sandbox "$@"
