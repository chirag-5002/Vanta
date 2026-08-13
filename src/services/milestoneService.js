import { EmbedBuilder, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';
import { unwrapReplitData } from '../utils/database.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

// Configuration keys
export const getMilestoneChannelKey = (guildId) => `guild:${guildId}:milestone:channelId`;
export const getReachedMilestonesKey = (guildId) => `guild:${guildId}:milestone:reached`;

/**
 * Dynamically generates standard milestones up to a given member count.
 * Includes small milestones for new/testing servers, and standard milestone steps thereafter.
 */
export function getMilestonesUpTo(count) {
  const milestones = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

  // From 1,000 to 5,000: steps of 500
  for (let m = 1000; m <= 5000; m += 500) {
    if (!milestones.includes(m)) milestones.push(m);
  }

  // From 5,000 to 20,000: steps of 1,000
  for (let m = 6000; m <= 20000; m += 1000) {
    if (!milestones.includes(m)) milestones.push(m);
  }

  // From 20,000 to 100,000: steps of 5,000
  for (let m = 25000; m <= 100000; m += 5000) {
    if (!milestones.includes(m)) milestones.push(m);
  }

  // Above 100,000: steps of 10,000
  if (count > 100000) {
    const step = 10000;
    const limit = Math.ceil(count / step) * step + step;
    for (let m = 110000; m <= limit; m += step) {
      if (!milestones.includes(m)) milestones.push(m);
    }
  }

  return milestones.filter(m => m <= count).sort((a, b) => a - b);
}

/**
 * Determines the next milestone targets.
 */
export function getNextMilestone(currentMilestone) {
  const list = getMilestonesUpTo(currentMilestone + 50000);
  const currentIndex = list.indexOf(currentMilestone);
  if (currentIndex !== -1 && currentIndex < list.length - 1) {
    return list[currentIndex + 1];
  }
  // Fallbacks if not found
  if (currentMilestone < 1000) return currentMilestone + 100;
  if (currentMilestone < 5000) return currentMilestone + 500;
  if (currentMilestone < 20000) return currentMilestone + 1000;
  return currentMilestone + 5000;
}

/**
 * Finds the milestone channel in the guild.
 * Checks the database configuration first, then falls back to auto-detecting by name.
 */
export async function getMilestoneChannel(guild, client) {
  if (client && client.db) {
    try {
      const channelId = unwrapReplitData(await client.db.get(getMilestoneChannelKey(guild.id)));
      if (channelId) {
        const configuredChannel = guild.channels.cache.get(channelId);
        if (configuredChannel && configuredChannel.type === ChannelType.GuildText) {
          return configuredChannel;
        }
      }
    } catch (err) {
      logger.error('Error fetching milestone channel from database:', err);
    }
  }

  // Fallback: auto-detect channel by name
  const guildChannels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;
  const autoChannel = guildChannels.find(c =>
    c && c.type === ChannelType.GuildText &&
    (c.name.toLowerCase() === 'milestone' || c.name.toLowerCase() === 'milestones' || c.name.toLowerCase().includes('milestone'))
  );

  return autoChannel || null;
}

/**
 * Triggered on member join. Checks if a milestone is reached and announces it.
 */
export async function checkAndAnnounceMilestone(member) {
  const { guild, client } = member;
  if (!client.db) return;

  try {
    const memberCount = guild.memberCount;
    const reachedKey = getReachedMilestonesKey(guild.id);
    const reachedMilestones = unwrapReplitData(await client.db.get(reachedKey)) || [];

    // Find all milestones <= current count
    const eligibleMilestones = getMilestonesUpTo(memberCount);
    
    // Find unannounced ones
    const unannounced = eligibleMilestones.filter(m => !reachedMilestones.includes(m));

    if (unannounced.length === 0) {
      return; // No new milestone reached
    }

    // Select the largest new milestone to announce
    const newMilestone = Math.max(...unannounced);
    const nextMilestone = getNextMilestone(newMilestone);

    // Update DB: mark this milestone and all smaller ones as reached
    const updatedReached = [...new Set([...reachedMilestones, ...eligibleMilestones])];
    await client.db.set(reachedKey, updatedReached);

    // Announce the milestone celebration
    await announceMilestoneCelebration(guild, client, newMilestone, memberCount, member, nextMilestone);

  } catch (error) {
    logger.error('Error in checkAndAnnounceMilestone:', error);
  }
}

/**
 * Prepares and sends the celebration embed.
 */
export async function announceMilestoneCelebration(guild, client, milestone, memberCount, member, nextMilestone) {
  const channel = await getMilestoneChannel(guild, client);
  if (!channel) {
    logger.debug(`No milestone channel configured or found in guild ${guild.name} (${guild.id}).`);
    return false;
  }

  const celebrationEmbed = new EmbedBuilder()
    .setColor(getColor('success', '#F1C40F')) // Gold / Success color
    .setTitle('🎉 SERVER MILESTONE ACHIEVED! 🎉')
    .setDescription(
      `### We have officially reached **${milestone.toLocaleString()}** members!\n\n` +
      `A huge thank you to our **${memberCount.toLocaleString()}th** member, ${member ? member.toString() : 'someone special'}! ` +
      `We are incredibly grateful for each and every one of you. Our community is growing stronger every single day! 🚀\n\n` +
      `✨ **Next Milestone:** \`${nextMilestone.toLocaleString()}\` members! ✨`
    )
    .setThumbnail(guild.iconURL({ dynamic: true }) || (member ? member.user.displayAvatarURL() : null))
    .addFields(
      { name: '📊 Total Members', value: `\`${memberCount.toLocaleString()}\``, inline: true },
      { name: '📅 Reached On', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: `${guild.name} • Milestones`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
    .setTimestamp();

  try {
    const celebrationMsg = await channel.send({ embeds: [celebrationEmbed] });
    
    // Attempt to pin the celebration message for extra premium feel
    await celebrationMsg.pin().catch(() => null);

    // Log the milestone event in the audit log
    try {
      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.GUILD_MEMBER_UPDATE || 'moderation.milestone',
        data: {
          title: '🏆 Server Milestone Reached',
          lines: [
            `**Milestone:** ${milestone.toLocaleString()} members`,
            `**Actual Member Count:** ${memberCount}`,
            `**Milestone Channel:** <#${channel.id}>`,
            `**Trigger Member:** ${member ? member.toString() : 'N/A'}`
          ],
          quoted: false,
          color: 0xF1C40F
        }
      });
    } catch (logErr) {
      logger.debug('Failed to log milestone event:', logErr);
    }

    return true;
  } catch (error) {
    logger.error('Failed to send milestone celebration:', error);
    return false;
  }
}
