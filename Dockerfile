FROM node:18
RUN apt-get update && apt-get install -y chromium --no-install-recommends
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json .
RUN npm install
COPY index.js .
CMD ["sh", "-c", "find /app/.wwebjs_auth -name 'Singleton*' -delete 2>/dev/null; node index.js"]
