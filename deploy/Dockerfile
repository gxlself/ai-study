FROM node:22-bookworm-slim AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    pnpm_config_verify_deps_before_run=false \
    NODE_OPTIONS=--max-old-space-size=1536
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate
COPY . .
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN --mount=type=cache,id=sprout-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store \
    --registry="${NPM_REGISTRY}" --fetch-timeout=600000
RUN pnpm content:bundle --pack content/packs/sprout-core
RUN node deploy/check-content.mjs
RUN pnpm --filter @sprout/server build
RUN pnpm --filter @sprout/player build
RUN pnpm --filter @sprout/admin build
RUN --mount=type=cache,id=sprout-pnpm-store,target=/pnpm/store \
    pnpm --registry="${NPM_REGISTRY}" --store-dir /pnpm/store \
    --fetch-timeout=600000 --filter @sprout/server deploy --legacy --prod /runtime

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 SPROUT_DATA_DIR=/data
COPY --from=builder --chown=node:node /runtime/node_modules ./node_modules
COPY --from=builder --chown=node:node /runtime/package.json ./package.json
COPY --from=builder --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=node:node /app/apps/player/dist ./apps/player/dist
COPY --from=builder --chown=node:node /app/apps/admin/dist ./apps/admin/dist
COPY --from=builder --chown=node:node /app/content ./content
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/api/health').then(r=>{if(!r.ok)throw Error(r.status)}).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/dist/index.js"]
