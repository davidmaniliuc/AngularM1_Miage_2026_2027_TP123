#!/usr/bin/env bash
# Génère les fichiers audio de référence des tests (1 s de sinus à 440 Hz).
# Les fichiers produits sont commités : ce script ne sert qu'à les recréer.
# Nécessite ffmpeg avec libmp3lame et libopus (build Homebrew ou Debian).
set -euo pipefail
cd "$(dirname "$0")"

F=(ffmpeg -nostdin -v error -y)
SINE=(-f lavfi -i sine=frequency=440:duration=1)
TAGS=(-metadata title=Sinus -metadata artist=Testeur -metadata album=Fixtures)

"${F[@]}" -f lavfi -i color=c=red:s=64x64 -frames:v 1 cover.jpg
"${F[@]}" -f lavfi -i color=c=blue:s=64x64 -frames:v 1 cover.png

"${F[@]}" "${SINE[@]}" -i cover.jpg -map 0:a -map 1:v -c:a alac -c:v copy \
  -disposition:v attached_pic "${TAGS[@]}" alac-cover.m4a
"${F[@]}" "${SINE[@]}" -c:a alac alac-nocover.m4a
"${F[@]}" "${SINE[@]}" -c:a aac -b:a 64k aac.m4a
# Même AAC, mais avec la marque MP4 "isom" (Android, convertisseurs en ligne).
"${F[@]}" "${SINE[@]}" -c:a aac -b:a 64k -f mp4 aac-isom.m4a
"${F[@]}" "${SINE[@]}" -i cover.png -map 0:a -map 1:v -c:a flac -c:v copy \
  -disposition:v attached_pic "${TAGS[@]}" flac-cover.flac
"${F[@]}" "${SINE[@]}" -c:a libmp3lame -b:a 64k plain.mp3
"${F[@]}" "${SINE[@]}" -c:a pcm_s16le plain.wav
"${F[@]}" "${SINE[@]}" -c:a libopus -b:a 32k plain.ogg
printf "ceci n'est pas de l'audio\n" > not-audio.m4a

rm cover.jpg cover.png
