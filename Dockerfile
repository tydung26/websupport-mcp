# The image aggregator build sandboxes run, and an alternative to `npx`.
#
# npm 10 cannot resolve the bundler's dependency tree (`edgesOut`), hence the
# upgrade. The runtime stage still installs production dependencies: the
# bundler never bundles the MCP SDK or zod, so the bundle imports both.

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
# Inlined into the bundle, so the build needs it present.
COPY assets ./assets
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g npm@11
# package.json ships too — serverInfo reads the version from it.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
ENTRYPOINT ["node", "dist/index.js"]
