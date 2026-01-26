# Use Node.js LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Set environment variables (override at runtime)
ENV NODE_ENV=production

# Expose port (optional, mainly for health checks if needed later)
EXPOSE 4000

# Start the worker by default
CMD ["npm", "run", "worker"]
