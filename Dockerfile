# Run index.js file in contianer
FROM node:lts

# Set working directory
WORKDIR /app

# Copy application files, package files
COPY . .

# Install dependencies
RUN npm install

# Set executable permissions for shell script
RUN chmod +x loop.sh

# Environment variable to choose script (default to index.js)
ENV RUN_SCRIPT=index
ENV SCRIPT_ARGS=""

# Run either index.js or loop.sh based on RUN_SCRIPT env variable
CMD sh -c 'if [ "$RUN_SCRIPT" = "loop" ]; then ./loop.sh $SCRIPT_ARGS; else node index.js $SCRIPT_ARGS; fi'