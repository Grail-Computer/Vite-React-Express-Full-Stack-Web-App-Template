# Use Node.js LTS as base image
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files and Prisma schema for better layer caching
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies (this will also run prisma generate via postinstall)
RUN npm ci --only=production=false

# Copy all source files
COPY . .

# Build the application
RUN npm run build

# Expose the port (adjust if your app uses a different port)
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
