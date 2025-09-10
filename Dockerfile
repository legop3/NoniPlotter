FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p plots
USER root
EXPOSE 3000
CMD ["node", "server.js"]
