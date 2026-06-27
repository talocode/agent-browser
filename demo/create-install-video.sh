#!/bin/bash
set -euo pipefail

# Agent Browser v0.2.0 installation video (Talocode video skill / ffmpeg renderer)
# Creates a terminal-style install walkthrough for GitHub release attachment.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${ROOT}/demo/agent-browser-v0.2.0-install.mp4"
TEMP_DIR="${ROOT}/demo/temp-install"

mkdir -p "$TEMP_DIR"

BG="0x1C1C1C"
PRIMARY="0x58C4DD"
SECONDARY="0x83C167"
ACCENT="0xFFFF00"
TEXT="0xFFFFFF"
DIM="0x888888"
GREEN="0x3FB950"
BLUE="0x58A6FF"

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

scene() {
  local id="$1"
  local duration="$2"
  shift 2
  ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=$duration" \
    -vf "$*" \
    -c:v libx264 -pix_fmt yuv420p "$TEMP_DIR/scene${id}.mp4" 2>/dev/null
}

echo "Scene 1: Hook"
scene 1 4 \
  "drawtext=text='Install Agent Browser in 60 seconds':fontsize=64:fontcolor=$PRIMARY:x=(w-text_w)/2:y=360:fontfile=$FONT,\
drawtext=text='Open-source browser automation for AI agents':fontsize=30:fontcolor=$TEXT:x=(w-text_w)/2:y=470:fontfile=$FONT_REGULAR"

echo "Scene 2: npm install"
scene 2 6 \
  "drawtext=text='Step 1 - Install the CLI':fontsize=42:fontcolor=$PRIMARY:x=360:y=260:fontfile=$FONT,\
drawtext=text='npm install -g @talocode/agent-browser@0.2.0':fontsize=34:fontcolor=$TEXT:x=360:y=400:fontfile=$FONT_REGULAR,\
drawtext=text='✓ added 1 package in 4s':fontsize=26:fontcolor=$SECONDARY:x=360:y=500:fontfile=$FONT_REGULAR"

echo "Scene 3: Playwright"
scene 3 6 \
  "drawtext=text='Step 2 - Install Chromium':fontsize=42:fontcolor=$PRIMARY:x=360:y=260:fontfile=$FONT,\
drawtext=text='npx playwright install chromium':fontsize=34:fontcolor=$TEXT:x=360:y=400:fontfile=$FONT_REGULAR,\
drawtext=text='✓ Chromium ready for smoke checks':fontsize=26:fontcolor=$SECONDARY:x=360:y=500:fontfile=$FONT_REGULAR"

echo "Scene 4: Verify CLI"
scene 4 5 \
  "drawtext=text='Step 3 - Verify install':fontsize=42:fontcolor=$PRIMARY:x=360:y=260:fontfile=$FONT,\
drawtext=text='agent-browser --help':fontsize=34:fontcolor=$TEXT:x=360:y=400:fontfile=$FONT_REGULAR,\
drawtext=text='check, screenshot, session, mcp, api':fontsize=24:fontcolor=$DIM:x=360:y=500:fontfile=$FONT_REGULAR"

echo "Scene 5: First check"
scene 5 7 \
  "drawtext=text='Step 4 - Run your first check':fontsize=42:fontcolor=$PRIMARY:x=360:y=220:fontfile=$FONT,\
drawtext=text='agent-browser check https\://example.com --json':fontsize=32:fontcolor=$TEXT:x=360:y=360:fontfile=$FONT_REGULAR,\
drawtext=text='status pass - Smoke check passed':fontsize=24:fontcolor=$SECONDARY:x=360:y=460:fontfile=$FONT_REGULAR,\
drawtext=text='Safe by default - private networks blocked':fontsize=22:fontcolor=$DIM:x=360:y=540:fontfile=$FONT_REGULAR"

echo "Scene 6: Sessions teaser"
scene 6 6 \
  "drawtext=text='v0.2 - Sessions and trace reports':fontsize=40:fontcolor=$ACCENT:x=360:y=240:fontfile=$FONT,\
drawtext=text='agent-browser session create --name deploy-check --json':fontsize=28:fontcolor=$TEXT:x=360:y=360:fontfile=$FONT_REGULAR,\
drawtext=text='agent-browser session report SESSION_ID --format markdown':fontsize=28:fontcolor=$TEXT:x=360:y=430:fontfile=$FONT_REGULAR,\
drawtext=text='Logical sessions for multi-step agent workflows':fontsize=24:fontcolor=$DIM:x=360:y=520:fontfile=$FONT_REGULAR"

echo "Scene 7: CTA"
scene 7 6 \
  "drawtext=text='Agent Browser v0.2.0':fontsize=72:fontcolor=$PRIMARY:x=(w-text_w)/2:y=300:fontfile=$FONT,\
drawtext=text='npm install -g @talocode/agent-browser':fontsize=30:fontcolor=$TEXT:x=(w-text_w)/2:y=430:fontfile=$FONT_REGULAR,\
drawtext=text='github.com/talocode/agent-browser':fontsize=34:fontcolor=$BLUE:x=(w-text_w)/2:y=520:fontfile=$FONT_REGULAR,\
drawtext=text='Local-first CLI and MCP - hosted API optional':fontsize=24:fontcolor=$DIM:x=(w-text_w)/2:y=590:fontfile=$FONT_REGULAR"

cat > "$TEMP_DIR/concat.txt" << EOF
file 'scene1.mp4'
file 'scene2.mp4'
file 'scene3.mp4'
file 'scene4.mp4'
file 'scene5.mp4'
file 'scene6.mp4'
file 'scene7.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i "$TEMP_DIR/concat.txt" -c copy "$TEMP_DIR/video_no_audio.mp4" 2>/dev/null

ffmpeg -y -f lavfi -i "sine=frequency=330:duration=40" -af "volume=0.025" -c:a aac "$TEMP_DIR/bg_audio.m4a" 2>/dev/null

ffmpeg -y -i "$TEMP_DIR/video_no_audio.mp4" -i "$TEMP_DIR/bg_audio.m4a" \
  -c:v copy -c:a aac -shortest "$OUTPUT" 2>/dev/null

rm -rf "$TEMP_DIR"

echo "Installation video created: $OUTPUT"
ls -lh "$OUTPUT"