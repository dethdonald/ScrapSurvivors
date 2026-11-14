# Shared update-check/download logic for Scrap Survivors on Linux/Steam Deck.
# Sourced by both ScrapSurvivors.sh (update-then-launch) and Update.sh (update-only, no launch).
# Expects HERE, APP, REPO, LOG to already be set by the caller.
#
# Sets UPD_RESULT to one of:
#   current        - already on the latest version
#   updated:<ver>   - downloaded and switched to <ver>
#   failed:<reason> - looked for an update but something went wrong (see reason)
#   offline         - couldn't reach GitHub at all (no internet, or GitHub down)
# Steam starts games with its own libraries switched in (LD_LIBRARY_PATH) and its overlay preloaded (LD_PRELOAD).
# The system's curl and tar can fail to start under those, and in Gaming Mode that looked exactly like "no internet":
# the old version just started, with nothing logged. So both always run with a clean environment here, and every
# curl failure is written to update-log.txt with its exit code and message.
clean() { env -u LD_PRELOAD -u LD_LIBRARY_PATH "$@"; }
update() {
  local remote local_v tmp src cerr
  local tok="" auth=()
  [ -f "$HERE/github-token.txt" ] && tok="$(tr -d ' \r\n' < "$HERE/github-token.txt")"
  if [ -n "$tok" ]; then
    auth=(-H "Authorization: Bearer $tok")
    remote="$(clean curl -fsSL --max-time 8 "${auth[@]}" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/$REPO/contents/VERSION?ref=main" 2>"$HERE/.curl-err" | head -c 64 | tr -d '\r\n')"
  else
    remote="$(clean curl -fsSL --max-time 8 "https://raw.githubusercontent.com/$REPO/main/VERSION?t=$(date +%s)" 2>"$HERE/.curl-err" | head -c 64 | tr -d '\r\n')"
  fi
  cerr="$(head -c 300 "$HERE/.curl-err" 2>/dev/null | tr '\n' ' ')"; rm -f "$HERE/.curl-err"
  if [ -z "$remote" ]; then
    UPD_RESULT="failed:couldn't read the remote VERSION (no internet, GitHub down, or the token/repo access is wrong)"
    echo "$(date) update check failed: ${cerr:-no answer} [token: $([ -n "$tok" ] && echo yes || echo no), LD_LIBRARY_PATH was: ${LD_LIBRARY_PATH:+set}${LD_LIBRARY_PATH:-empty}]" >> "$LOG"
    return 0
  fi
  local_v="$(cat "$APP/VERSION" 2>/dev/null | tr -d '\r\n')"
  if [ "$remote" = "$local_v" ]; then UPD_RESULT="current"; return 0; fi
  echo "$(date) updating $local_v -> $remote" >> "$LOG"
  echo "Updating Scrap Survivors $local_v -> $remote ..."
  tmp="$(mktemp -d)" || { UPD_RESULT="failed:couldn't create a temp folder"; return 0; }
  local url="https://codeload.github.com/$REPO/tar.gz/refs/heads/main"
  [ -n "$tok" ] && url="https://api.github.com/repos/$REPO/tarball/main"
  if clean curl -fsSL --max-time 120 "${auth[@]}" "$url" -o "$tmp/u.tgz" 2>>"$LOG" && clean tar -xzf "$tmp/u.tgz" -C "$tmp" 2>>"$LOG"; then
    src="$(find "$tmp" -mindepth 2 -maxdepth 2 -type d -name app | head -1)"
    if [ -n "$src" ] && [ -f "$src/index.html" ] && [ -f "$src/main.js" ]; then
      rm -rf "$APP.new" "$APP.old"
      cp -r "$src" "$APP.new" && mv "$APP" "$APP.old" && mv "$APP.new" "$APP" && rm -rf "$APP.old"
      # a newer launcher (this script) and updater (Update.sh) come along too; used from the next run
      local depot="$(dirname "$src")/deck"
      for f in ScrapSurvivors.sh Update.sh update-lib.sh; do
        if [ -f "$depot/$f" ]; then cp "$depot/$f" "$HERE/$f.new" && chmod +x "$HERE/$f.new" && mv "$HERE/$f.new" "$HERE/$f"; fi
      done
      echo "$(date) updated to $remote" >> "$LOG"
      UPD_RESULT="updated:$remote"
    else
      echo "$(date) download looked wrong, kept $local_v" >> "$LOG"
      UPD_RESULT="failed:the download looked incomplete, kept the current version ($local_v)"
    fi
  else
    echo "$(date) download failed, kept $local_v" >> "$LOG"
    UPD_RESULT="failed:the download itself failed, kept the current version ($local_v)"
  fi
  rm -rf "$tmp"
}
