FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js styles.css user.css ./
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV STUDY_DATABASE_PATH=/app/data/study_companion.db
ENV STUDY_UPLOAD_PATH=/app/data/originals
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev && mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/scripts ./backend/scripts
COPY --chown=node:node shared ./shared
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]
