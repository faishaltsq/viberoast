FROM mcr.microsoft.com/playwright:v1.58.2-noble
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/tmp
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.3.4 --ignore-scripts
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY lib/security ./lib/security
COPY lib/types ./lib/types
COPY worker ./worker
RUN chmod 0755 /app/worker/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/worker/entrypoint.sh"]
