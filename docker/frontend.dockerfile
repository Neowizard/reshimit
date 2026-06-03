FROM node:18-alpine

WORKDIR /app

# Build and run as the image's built-in unprivileged "node" user (uid 1000)
RUN chown node:node /app
USER node

COPY --chown=node:node frontend/package.json .
COPY --chown=node:node frontend/package-lock.json .

RUN npm install

COPY --chown=node:node frontend/ .

# Pass env var at build time
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

EXPOSE 4433

CMD ["npm", "start"]
