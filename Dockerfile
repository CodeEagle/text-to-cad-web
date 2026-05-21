FROM node:22-bookworm-slim AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv python3-pip build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv python3-pip build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @openai/codex \
  && mkdir -p /data /opt/text-to-cad-skills

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY vendor/text-to-cad-skills /opt/text-to-cad-skills
COPY . .
RUN chmod +x scripts/docker-entrypoint.sh
RUN npm --prefix vendor/cad-viewer ci
ENV NEXT_TELEMETRY_DISABLED=1
ENV TEXT_TO_CAD_DATA_DIR=/data
ENV TEXT_TO_CAD_PYTHON_VENV=/opt/text-to-cad-python
ENV TEXT_TO_CAD_EXPLORER_BIND_HOST=0.0.0.0
RUN npm run setup:cad-python
RUN npm run build

EXPOSE 3000 4178
VOLUME ["/data"]
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
