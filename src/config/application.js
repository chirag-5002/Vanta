import { fileURLToPath } from "url";
import path from "path";
import botConfig, { validateConfig } from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";
import { pgConfig } from "./database/postgres.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sanitize DISCORD_TOKEN in case multiple env lines were pasted into Railway's single variable field
const rawEnvToken = process.env.DISCORD_TOKEN || process.env.TOKEN || '';
let cleanEnvToken = String(rawEnvToken).trim().replace(/^["']|["']$/g, '');
let extractedGuildId = process.env.GUILD_ID;
let extractedClientId = process.env.CLIENT_ID;

if (cleanEnvToken.includes('\n') || cleanEnvToken.includes('\r')) {
  const lines = cleanEnvToken.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^GUILD_ID\s*=/i.test(line)) {
      extractedGuildId = extractedGuildId || line.split('=')[1]?.trim();
      process.env.GUILD_ID = extractedGuildId;
    } else if (/^CLIENT_ID\s*=/i.test(line)) {
      extractedClientId = extractedClientId || line.split('=')[1]?.trim();
      process.env.CLIENT_ID = extractedClientId;
    } else if (line.length > 25 && !line.includes('=')) {
      cleanEnvToken = line.replace(/^["']|["']$/g, '');
    }
  }
}

const appConfig = {
  paths: {
    root: path.join(__dirname, "../.."),
    commands: path.join(__dirname, "../commands"),
    events: path.join(__dirname, "../events"),
    config: __dirname,
    utils: path.join(__dirname, "../utils"),
    services: path.join(__dirname, "../services"),
    handlers: path.join(__dirname, "../handlers"),
    interactions: path.join(__dirname, "../interactions"),
  },

  bot: {
    ...botConfig,
    token: cleanEnvToken,
    clientId: extractedClientId,
    // Retained for tutorial/setup compatibility; not used for command registration.
    guildId: extractedGuildId,

    shop: {
      ...botConfig.shop,
      ...shop,
    },
  },

  // PostgreSQL configuration - Primary production database
  postgresql: {
    ...pgConfig,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: {
      enabled: process.env.LOG_TO_FILE === "true",
      path: path.join(__dirname, "../../logs"),
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    },
    console: {
      enabled: true,
      colorize: true,
      timestamp: true,
    },
    sentry: {
      enabled: process.env.SENTRY_DSN ? true : false,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
    },
  },

  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  },

  shop,

  features: {
    ...botConfig.features,
    music: botConfig.features?.music ?? true,
  },

  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

Object.freeze(appConfig);

export default appConfig;