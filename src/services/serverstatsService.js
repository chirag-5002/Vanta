// serverstatsService.js

import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { getServerCountersKey, getP2PDealsKey } from '../utils/database/keys.js';
import { getFromDb } from '../utils/database.js';
import botConfig from '../config/bot.js';

export const COUNTER_TYPE_CONFIG = {
  members: {
    label: 'Members + Bots',
    baseName: 'Members & Bots',
    emoji: '👥'
  },
  members_only: {
    label: 'Members Only',
    baseName: 'Members',
    emoji: '👤'
  },
  bots: {
    label: 'Bots Only',
    baseName: 'Bots',
    emoji: '🤖'
  },
  calendar: {
    label: 'Calendar Date',
    baseName: 'Calendar Date',
    emoji: '📅'
  },
  traders: {
    label: 'Total Traders',
    baseName: 'Total Traders',
    emoji: '👥'
  },
  active: {
    label: 'Active Now',
    baseName: 'Active Now',
    emoji: '🟢'
  },
  kyc_count: {
    label: 'KYC Verified',
    baseName: 'KYC Verified',
    emoji: '📰'
  },
  transactions: {
    label: 'Total Transactions',
    baseName: 'Transactions',
    emoji: '🔄'
  },
  usdt_volume: {
    label: 'USDT Volume',
    baseName: 'USDT Volume',
    emoji: '💰'
  }
};

function getCounterConfig(type) {
  return COUNTER_TYPE_CONFIG[type] || {
    label: 'Unknown',
    baseName: 'Counter',
    emoji: '❓'
  };
}

export function getCounterTypeLabel(type) {
  return getCounterConfig(type).label;
}

export function getCounterBaseName(type) {
  return getCounterConfig(type).baseName;
}

export function getCounterEmoji(type) {
  return getCounterConfig(type).emoji;
}

export function formatCounterChannelName(type, count) {
  const formattedCount = typeof count === 'number' ? count.toLocaleString('en-US') : count;

  switch (type) {
    case 'calendar':
      return `│📅 · ${formattedCount}`;
    case 'traders':
      return `│👥 · Total Traders: ${formattedCount}`;
    case 'active':
      return `│🟢 · Active Now: ${formattedCount}`;
    case 'kyc_count':
      return `│📰 · KYC Verified: ${formattedCount}`;
    case 'transactions':
      return `│🔄 · Transactions: ${formattedCount}`;
    case 'usdt_volume':
      return `│💰 · USDT Volume: ${formattedCount}`;
    default: {
      const template = botConfig.counters?.defaults?.channelName || '{name}-{count}';
      const baseName = getCounterBaseName(type);
      return template
        .replaceAll('{name}', baseName)
        .replaceAll('{count}', String(formattedCount));
    }
  }
}

export function getCounterActionMessage(action, values = {}) {
  const template = botConfig.counters?.messages?.[action];
  if (!template) {
    return null;
  }

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export async function getGuildCounterStats(guild) {
  let memberCollection = guild.members.cache;

  try {
    memberCollection = await guild.members.fetch();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Failed to fetch all guild members for ${guild.id}, using cache only`, error);
    }
  }

  const botCount = memberCollection.filter((member) => member.user.bot).size;
  const totalCount = typeof guild.memberCount === 'number' ? guild.memberCount : memberCollection.size;
  const humanCount = Math.max(totalCount - botCount, 0);

  return {
    totalCount,
    botCount,
    humanCount
  };
}

export async function getCounterCount(guild, type) {
  const client = guild.client;

  switch (type) {
    case 'members': {
      const stats = await getGuildCounterStats(guild);
      return stats.totalCount;
    }
    case 'bots': {
      const stats = await getGuildCounterStats(guild);
      return stats.botCount;
    }
    case 'members_only': {
      const stats = await getGuildCounterStats(guild);
      return stats.humanCount;
    }
    case 'calendar': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const getOrdinalSuffix = (day) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
          case 1:  return "st";
          case 2:  return "nd";
          case 3:  return "rd";
          default: return "th";
        }
      };

      const now = new Date();
      const dayName = days[now.getDay()];
      const dateNum = now.getDate();
      const monthName = months[now.getMonth()];
      return `${dayName}, ${dateNum}${getOrdinalSuffix(dateNum)} ${monthName}`;
    }
    case 'active': {
      try {
        const fetchedGuild = await client.guilds.fetch({ guild: guild.id, withCounts: true }).catch(() => guild);
        let activeCount = fetchedGuild.approximatePresenceCount;
        
        if (activeCount === undefined || activeCount === null) {
          activeCount = guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size;
        }
        if (!activeCount) {
          activeCount = guild.members.cache.filter(m => m.voice && m.voice.channelId).size;
        }
        return activeCount;
      } catch (error) {
        logger.error('Error fetching active count for counter:', error);
        return 0;
      }
    }
    case 'kyc_count': {
      try {
        const { getKycConfig } = await import('./kycService.js');
        const kycConfig = await getKycConfig(guild.id).catch(() => null);
        if (kycConfig && kycConfig.roleId) {
          try {
            const membersWithRole = await guild.members.fetch({ role: kycConfig.roleId });
            if (membersWithRole) {
              return membersWithRole.size;
            }
          } catch (err) {
            logger.warn(`Failed to fetch role members for KYC stats: ${err.message}`);
          }
        }
        
        if (client.db && client.db.isAvailable() && client.db.db.pool) {
          const result = await client.db.db.pool.query(
            `SELECT COUNT(*) FROM temp_data WHERE key LIKE $1 AND value->>'status' = 'verified'`,
            [`guild:${guild.id}:kyc:user:%`]
          );
          return parseInt(result.rows[0].count, 10);
        } else if (client.db) {
          const prefix = `guild:${guild.id}:kyc:user:`;
          const keys = await client.db.list(prefix);
          let count = 0;
          for (const key of keys) {
            const data = await client.db.get(key);
            if (data && data.status === 'verified') {
              count++;
            }
          }
          return count;
        }
        return 0;
      } catch (error) {
        logger.error('Error counting KYC verified for counter:', error);
        return 0;
      }
    }
    case 'traders': {
      try {
        const dealsKey = getP2PDealsKey(guild.id);
        const rawDeals = await getFromDb(dealsKey, []);
        const deals = Array.isArray(rawDeals) ? rawDeals : [];
        const completed = deals.filter(d => d.status === 'Completed');
        const tradersSet = new Set();
        completed.forEach(d => {
          if (d.buyerId && d.buyerId !== 'server') tradersSet.add(d.buyerId);
          if (d.sellerId && d.sellerId !== 'server') tradersSet.add(d.sellerId);
        });
        return tradersSet.size;
      } catch (error) {
        logger.error('Error fetching traders count for counter:', error);
        return 0;
      }
    }
    case 'transactions': {
      try {
        const dealsKey = getP2PDealsKey(guild.id);
        const rawDeals = await getFromDb(dealsKey, []);
        const deals = Array.isArray(rawDeals) ? rawDeals : [];
        const completed = deals.filter(d => d.status === 'Completed');
        return completed.length;
      } catch (error) {
        logger.error('Error fetching transactions count for counter:', error);
        return 0;
      }
    }
    case 'usdt_volume': {
      try {
        const dealsKey = getP2PDealsKey(guild.id);
        const rawDeals = await getFromDb(dealsKey, []);
        const deals = Array.isArray(rawDeals) ? rawDeals : [];
        const completed = deals.filter(d => d.status === 'Completed');
        const totalVolume = completed.reduce((acc, d) => acc + (parseFloat(d.usdtAmount) || 0), 0);
        return Math.floor(totalVolume);
      } catch (error) {
        logger.error('Error fetching USDT volume for counter:', error);
        return 0;
      }
    }
    default:
      return null;
  }
}

function isValidCounterShape(counter) {
  return Boolean(
    counter &&
    typeof counter === 'object' &&
    typeof counter.id === 'string' &&
    counter.id.length > 0 &&
    typeof counter.type === 'string' &&
    typeof counter.channelId === 'string' &&
    counter.channelId.length > 0
  );
}

function normalizeCounter(counter, guildId) {
  const normalized = {
    id: String(counter.id),
    type: String(counter.type),
    channelId: String(counter.channelId),
    guildId: String(counter.guildId || guildId),
    createdAt: counter.createdAt || new Date().toISOString(),
    enabled: typeof counter.enabled === 'boolean' ? counter.enabled : true
  };

  if (counter.updatedAt) {
    normalized.updatedAt = counter.updatedAt;
  }

  return normalized;
}

function sanitizeCounters(counters, guildId) {
  if (!Array.isArray(counters)) {
    return [];
  }

  return counters
    .filter(isValidCounterShape)
    .map(counter => normalizeCounter(counter, guildId));
}

export async function updateCounter(client, guild, counter) {
  try {
    if (!counter || !counter.type || !counter.channelId) {
      logger.warn('Skipping invalid counter in updateCounter:', counter);
      return false;
    }
    
    const { type, channelId } = counter;
    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }
    if (!channel) {
      logger.warn(`Counter channel ${channelId} not found in guild ${guild.id}, skipping update`);
      return false;
    }

    const count = await getCounterCount(guild, type);
    if (count === null) {
      logger.error('Unknown counter type:', type);
      return false;
    }

    const baseName = getCounterBaseName(type);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Base name: "${baseName}", Current name: "${channel.name}"`);
    }
    
    const newName = formatCounterChannelName(type, count);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`New name would be: "${newName}"`);
    }
    
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Updated channel name to: "${newName}"`);
        }

        try {
          await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.COUNTER_UPDATE,
            data: {
              title: 'Counter Updated',
              lines: [
                formatLogLine('Type', getCounterTypeLabel(type)),
                formatLogLine('Count', count.toString()),
                formatLogLine('Channel', channel.toString()),
              ],
              channelId: channel.id,
            },
          });
        } catch (error) {
          logger.debug('Error logging counter update:', error);
        }

      } catch (error) {
        logger.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Channel name already correct, no update needed');
      }
    }
    return true;
  } catch (error) {
    logger.error("Error updating counter:", error);
    return false;
  }
}

export async function getServerCounters(client, guildId) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for getServerCounters');
      return [];
    }
    
    const data = await client.db.get(getServerCountersKey(guildId));
    
    let counters = [];
    
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        counters = Array.isArray(parsed) ? parsed : [];
      } catch {
        counters = [];
      }
    } else if (data && typeof data === 'object' && !data.ok && isValidCounterShape(data)) {
      counters = [data];
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('No counter data found, returning empty array');
      }
      return [];
    }

    return sanitizeCounters(counters, guildId);
  } catch (error) {
    logger.error("Error getting server counters:", error);
    return [];
  }
}

export async function saveServerCounters(client, guildId, counters) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for saveServerCounters');
      return false;
    }
    
    const sanitizedCounters = sanitizeCounters(counters, guildId);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Saving ${sanitizedCounters.length} counters for guild ${guildId}:`, sanitizedCounters);
    }

    await client.db.set(getServerCountersKey(guildId), sanitizedCounters);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Counters saved successfully');
    }
    return true;
  } catch (error) {
    logger.error("Error saving server counters:", error);
    return false;
  }
}

export async function updateP2PCounters(client, guild) {
  try {
    const counters = await getServerCounters(client, guild.id);
    for (const counter of counters) {
      if (counter && ['traders', 'transactions', 'usdt_volume'].includes(counter.type)) {
        await updateCounter(client, guild, counter);
      }
    }
  } catch (error) {
    logger.error('Error updating P2P counters:', error);
  }
}