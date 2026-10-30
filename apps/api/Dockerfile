# Runtime-only image: `nx build api` bundles every dependency into
# dist/apps/api/main.js, so there's nothing to install here.
# Build from the repo root after building:
#   npx nx build api && docker build -f apps/api/Dockerfile -t bivy .
FROM node:24-slim

ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY dist/apps/api/main.js dist/apps/api/package.json ./

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "main.js"]
