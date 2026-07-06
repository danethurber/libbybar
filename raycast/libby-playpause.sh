#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Libby Play/Pause
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🎧
# @raycast.packageName LibbyBar

# Documentation:
# @raycast.description Toggle play/pause in the LibbyBar menu bar app
# @raycast.author Dane Thurber

curl -s -m 2 -H "X-LibbyBar: 1" "http://127.0.0.1:48151/playpause" > /dev/null \
  || echo "LibbyBar isn't running"
