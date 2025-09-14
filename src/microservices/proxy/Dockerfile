# Use Node.js LTS
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production || npm install --production --no-audit --no-fund

# Copy source
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8000
CMD ["npm", "start"]
