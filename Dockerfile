# Reproducible image for registry build sandboxes (Glama, MCP hosting) and for
# anyone who would rather run a container than `npx`.
#
# Three deliberate choices:
#   * npm is upgraded to 11 before install. npm 10 cannot resolve the bundler's
#     dependency tree at all, failing with `Cannot read properties of null
#     (reading 'edgesOut')` — the same reason CI pins it.
#   * the runtime stage still installs production dependencies. The bundler
#     never bundles the MCP SDK or zod, since bundling the SDK would defeat its
#     conditional exports, so the bundle imports both at runtime.
#   * package.json ships into the runtime stage. serverInfo reads the version
#     from it, and without it every client sees 0.0.0.
#
# No credentials are baked in. The server starts without them and answers
# tools/list; a tool call resolves them from the environment at request time.

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
# Imported by src and inlined into the bundle, so the build needs it present.
COPY assets ./assets
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
# stdio transport: stdout is JSON-RPC, every diagnostic goes to stderr.
ENTRYPOINT ["node", "dist/index.js"]
