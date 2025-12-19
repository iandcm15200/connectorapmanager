FROM node:25.2.1-slim

WORKDIR /app

# Instalar dependencias necesarias para Playwright
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY package*.json ./

RUN npm install --production

# Instalar navegadores de Playwright
RUN npx playwright install --with-deps chromium

COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production PORT=3001

EXPOSE 3001

CMD ["node", "api-servidor.js"]
