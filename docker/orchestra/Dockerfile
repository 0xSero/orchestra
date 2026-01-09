FROM node:20-bookworm-slim

ARG OPENCODE_VERSION=1.0.203
ARG BUN_VERSION=1.3.4

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git procps unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

ENV PATH=/root/.bun/bin:$PATH

RUN npm install -g opencode-ai@${OPENCODE_VERSION}

WORKDIR /workspace

ENV XDG_CONFIG_HOME=/data
ENV OPENCODE_HOSTNAME=0.0.0.0
ENV OPENCODE_PORT=4096

COPY docker/orchestra/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
