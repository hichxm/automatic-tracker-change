# Run index.js file in container
FROM node:lts-alpine

# Set working directory
WORKDIR /app

# Copy application files, package files
COPY . .

# Install production dependencies only
RUN npm install --production

# Optional runtime args for index.js
ENV SCRIPT_ARGS=""

# To enable loop mode, pass "--loop" (and optional "--interval <sec>") via SCRIPT_ARGS
# Or use env vars: QBT_LOOP=1 and QBT_LOOP_INTERVAL=10
CMD sh -c 'node index.js $SCRIPT_ARGS'