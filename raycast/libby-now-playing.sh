#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Libby Now Playing
# @raycast.mode inline

# Optional parameters:
# @raycast.icon 🎧
# @raycast.refreshTime 10s
# @raycast.packageName LibbyBar

# Documentation:
# @raycast.description Show what LibbyBar is currently playing
# @raycast.author Dane Thurber

json=$(curl -s -m 2 -H "X-LibbyBar: 1" "http://127.0.0.1:48151/status") || {
  echo "LibbyBar isn't running"
  exit 0
}

# Pull fields without requiring jq.
has_media=$(echo "$json" | sed -n 's/.*"hasMedia":\([a-z]*\).*/\1/p')
if [ "$has_media" != "true" ]; then
  echo "Nothing playing"
  exit 0
fi

title=$(echo "$json" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')
artist=$(echo "$json" | sed -n 's/.*"artist":"\([^"]*\)".*/\1/p')
playing=$(echo "$json" | sed -n 's/.*"playing":\([a-z]*\).*/\1/p')

icon="⏸"
[ "$playing" = "true" ] && icon="▶"

if [ -n "$artist" ]; then
  echo "$icon $title — $artist"
else
  echo "$icon $title"
fi
