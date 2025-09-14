FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production || npm install --production --no-audit --no-fund
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8082
CMD ["npm", "start"]
