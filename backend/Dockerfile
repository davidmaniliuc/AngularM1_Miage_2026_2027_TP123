# Image de développement du backend : Bun + ffmpeg (conversion ALAC → FLAC).
# Le code n'est pas copié : docker-compose monte ./backend dans /app.
FROM oven/bun:1.4.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
