FROM node:22-bookworm-slim AS asr-build
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ make ca-certificates && rm -rf /var/lib/apt/lists/*
COPY server/vendor/asr/whisper-v1.9.5.tar.gz /tmp/whisper.tar.gz
RUN echo "ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720  /tmp/whisper.tar.gz" | sha256sum -c - \
    && mkdir /src && tar -xzf /tmp/whisper.tar.gz -C /src --strip-components=1 \
    && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_CURL=OFF \
    && cmake --build /src/build --target whisper-cli -j 4

FROM node:22-bookworm-slim AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app/server
ENV NODE_ENV=production API_PORT=8788 APP_AUTH_MODE=password \
    DOCUMENT_PYTHON=/usr/bin/python3 DOCUMENT_SOFFICE=/usr/bin/soffice \
    FUNDAPP_HARNESS_MODULE=/app/server/harness/runner.mjs \
    MATERIAL_STORAGE_ROOT=/app/private-material-storage/data
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pil poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng \
    libreoffice-writer libreoffice-calc libreoffice-impress ffmpeg fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=asr-build /src/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY server/vendor/asr/ggml-small-q5_1.bin /opt/fundapp-asr/ggml-small-q5_1.bin
RUN echo "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb  /opt/fundapp-asr/ggml-small-q5_1.bin" | sha256sum -c -
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/harness/package*.json ./harness/
RUN cd harness && npm ci --omit=dev
RUN apt-get update && apt-get install -y --no-install-recommends gosu python3-openpyxl python3-olefile && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/server/dist ./dist
COPY server/migrations ./migrations
COPY server/scripts ./scripts
COPY server/harness/*.mjs ./harness/
COPY docs/source-materials/ /app/docs/source-materials/
RUN mkdir -p /app/private-material-storage/data && chown node:node /app/private-material-storage /app/private-material-storage/data
EXPOSE 8788
CMD ["sh", "scripts/container-entrypoint.sh"]
