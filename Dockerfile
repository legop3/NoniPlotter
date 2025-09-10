FROM node:18-alpine
WORKDIR /app
# Grab git so we can update the repo on container start
RUN apk add --no-cache git
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p plots
USER root
EXPOSE 3000
CMD ["node", "server.js"]
