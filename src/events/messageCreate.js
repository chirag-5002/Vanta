import { Events, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// Anti-spam configuration for #p2p-chat and #chat-box
const spamTrackers = new Map();
const SPAM_MAX_MESSAGES = 5;
const SPAM_WINDOW_MS = 4000;
const SPAM_MAX_DUPLICATES = 4;
const TIMEOUT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      const channelName = message.channel.name?.toLowerCase() || '';

      // Immediately run anti-spam checks in #p2p-chat and #chat-box
      const isSpamProtectedChannel = channelName.includes('p2p-chat') || channelName.includes('chat-box');
      if (isSpamProtectedChannel) {
        const isAdminOrMod = message.member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                             message.member?.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!isAdminOrMod) {
          const userId = message.author.id;
          const now = Date.now();
          const messageContent = message.content?.trim().toLowerCase() || '';

          if (!spamTrackers.has(userId)) {
            spamTrackers.set(userId, {
              timestamps: [now],
              lastMessage: messageContent,
              duplicateCount: 1
            });
          } else {
            const data = spamTrackers.get(userId);
            data.timestamps = data.timestamps.filter(t => now - t < SPAM_WINDOW_MS);
            data.timestamps.push(now);

            if (messageContent.length > 0 && data.lastMessage === messageContent) {
              data.duplicateCount += 1;
            } else {
              data.lastMessage = messageContent;
              data.duplicateCount = 1;
            }

            spamTrackers.set(userId, data);

            let isSpamming = false;
            let spamReason = '';

            if (data.timestamps.length >= SPAM_MAX_MESSAGES) {
              isSpamming = true;
              spamReason = 'Sending too many messages too quickly';
            } else if (data.duplicateCount >= SPAM_MAX_DUPLICATES) {
              isSpamming = true;
              spamReason = 'Sending duplicate messages repeatedly';
            }

            if (isSpamming) {
              spamTrackers.delete(userId);

              const member = message.member;
              let timeoutSuccess = false;
              if (member && member.moderatable) {
                try {
                  await member.timeout(TIMEOUT_DURATION_MS, `Anti-Spam: ${spamReason} in #${message.channel.name}`);
                  timeoutSuccess = true;
                } catch (timeoutErr) {
                  logger.error(`Failed to timeout user ${userId} for spam:`, timeoutErr);
                }
              }

              if (timeoutSuccess) {
                // Delete user's spam messages
                try {
                  const recentMessages = await message.channel.messages.fetch({ limit: 15 }).catch(() => null);
                  if (recentMessages) {
                    const userSpamMsgs = recentMessages.filter(m => m.author.id === userId);
                    for (const m of userSpamMsgs.values()) {
                      await m.delete().catch(() => null);
                    }
                  }
                } catch (delErr) {
                  logger.warn('Failed to clean up spam messages:', delErr.message);
                }

                // Send warning notification in channel (deletes in 10s)
                const warnMsg = await message.channel.send({
                  content: `⚠️ **Anti-Spam System:** <@${userId}> has been timed out (muted) for 2 hours due to spamming in this channel.`
                }).catch(() => null);

                if (warnMsg) {
                  setTimeout(async () => {
                    await warnMsg.delete().catch(() => null);
                  }, 10000);
                }

                // Log to moderation channel
                try {
                  const guildChannels = await message.guild.channels.fetch().catch(() => null) || message.guild.channels.cache;
                  const logChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    (c.name.toLowerCase() === 'logging' || c.name.toLowerCase() === 'mod' || c.name.toLowerCase().includes('log'))
                  );

                  if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                      .setTitle('🚨 Anti-Spam Auto-Timeout Triggered')
                      .setDescription(
                        `**User:** <@${userId}> (${message.author.tag})\n` +
                        `**User ID:** \`${userId}\`\n` +
                        `**Action:** Timed Out (2 Hours)\n` +
                        `**Channel:** <#${message.channel.id}>\n` +
                        `**Reason:** ${spamReason}\n` +
                        `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
                      )
                      .setColor('#E74C3C')
                      .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                  }
                } catch (logErr) {
                  logger.error('Failed to log spam timeout to log channel:', logErr);
                }
              }
              return;
            }
          }
        }
      }

      // Immediately clean user clutter in P2P Buy/Sell portal channels
      const isP2PPortal = channelName.includes('looking-to-buy') || 
                           channelName.includes('looking-to-sell') || 
                           channelName.includes('buy-usdt') || 
                           channelName.includes('sell-usdt') || 
                           channelName === 'buy' || 
                           channelName === 'sell';

      if (isP2PPortal) {
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                        message.member?.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!isAdmin) {
          await message.delete().catch(() => null);
          const { autoDeployP2PPanels } = await import('../services/p2pService.js');
          await autoDeployP2PPanels(message.guild).catch(() => null);
          return;
        }
      }

      // Immediately handle query ticket creation in support channel
      if (channelName.includes('support')) {
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                        message.member?.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!isAdmin) {
          const userQuery = message.content;
          await message.delete().catch(() => null);

          if (userQuery && userQuery.trim().length > 0) {
            const { createSupportQueryTicket } = await import('../services/supportService.js');
            await createSupportQueryTicket(message.guild, message.member, userQuery, client).catch(() => null);
          }
          return;
        }
      }

      // Immediately clean user clutter in report-a-user channel
      if (channelName.includes('report-a-user')) {
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                        message.member?.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!isAdmin) {
          await message.delete().catch(() => null);
          const { autoDeployReportPanel } = await import('../services/reportService.js');
          await autoDeployReportPanel(message.guild).catch(() => null);
          return;
        }
      }

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleAutoP2PKeyword(message);

      await handleReceiptUpload(message, client);

      // await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handleReceiptUpload(message, client) {
  try {
    const channelName = message.channel?.name?.toLowerCase() || '';
    if (!channelName.includes('ticket') && !channelName.includes('p2p')) return;

    // Check if the message has any attachments
    if (!message.attachments || message.attachments.size === 0) return;

    // Get ticket data to check if this is the ticket creator
    const { getTicketData } = await import('../utils/database.js');
    const ticketData = await getTicketData(message.guild.id, message.channel.id).catch(() => null);

    // Strictly ensure this is a P2P trade ticket (Buy/Sell USDT)
    const isP2P = ticketData && 
                  (ticketData.reason?.includes('USDT') && 
                   (ticketData.reason?.startsWith('Buy') || ticketData.reason?.startsWith('Sell')));
    if (!isP2P) return;

    // Hybrid check: DB record OR check if they have a specific user permission overwrite (excluding the bot itself)
    const isCreator = (ticketData && ticketData.userId === message.author.id) ||
                      (message.channel.permissionOverwrites.cache.has(message.author.id) &&
                       message.author.id !== client.user.id);

    if (!isCreator) return;

    // Prevent duplicate receipt messages (one per ticket) using transient client memory
    if (!client.p2pReceipts) {
      client.p2pReceipts = new Set();
    }
    
    if (client.p2pReceipts.has(message.channel.id)) return;
    client.p2pReceipts.add(message.channel.id);

    const embed = new EmbedBuilder()
      .setTitle('📥 Payment Receipt Received')
      .setDescription(
        `Thank you for uploading your payment screenshot. Our team will verify your payment shortly.\n\n` +
        `> **Verification Status:** \`Pending Verification\`\n` +
        `> **Estimated Time:** \`Up to 1 hour (max)\` to complete the transaction.`
      )
      .setColor('#FFC107')
      .setFooter({ text: 'ICN P2P Auto-MM • Keep chats inside this channel' });

    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    logger.debug('Receipt Upload Listener skipped:', err.message);
  }
}

async function handleAutoP2PKeyword(message) {
  try {
    const channelName = message.channel?.name?.toLowerCase() || '';
    if (!channelName.includes('ticket') && !channelName.includes('p2p')) return;

    // Get ticket data to check if this is a P2P ticket
    const { getTicketData } = await import('../utils/database.js');
    const ticketData = await getTicketData(message.guild.id, message.channel.id).catch(() => null);

    const isP2P = ticketData && 
                  (ticketData.reason?.includes('USDT') && 
                   (ticketData.reason?.startsWith('Buy') || ticketData.reason?.startsWith('Sell')));
    if (!isP2P) return;

    const content = message.content || '';
    const isTxHash = /(0x[a-fA-F0-9]{40,66})|(https?:\/\/(bscscan|etherscan|tronscan|solscan)[^\s]+)/i.test(content);
    const isKeyword = /(deal done|complete deal|trade complete|deal completed|usdt sent)/i.test(content);

    if (isTxHash || isKeyword) {
      const { autoDetectAndPublishDeal } = await import('../services/p2pService.js');
      await autoDetectAndPublishDeal(message.channel, message.guild.id, message.author.id);
    }
  } catch (err) {
    logger.debug('Auto P2P Keyword Listener skipped:', err.message);
  }
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);

    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);

    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    const result = await addXp(client, message.guild, message.member, finalXP);

    if (result?.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}