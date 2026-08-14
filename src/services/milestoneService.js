import { EmbedBuilder, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';
import { unwrapReplitData } from '../utils/database.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { generateMilestoneCard } from '../utils/milestoneCard.js';

// Configuration keys
export const getMilestoneChannelKey = (guildId) => `guild:${guildId}:milestone:channelId`;
export const getReachedMilestonesKey = (guildId) => `guild:${guildId}:milestone:reached`;

export function getMilestonesUpTo(count) {
  const milestones = [200, 500, 1000, 1500, 2000, 3000, 4000];

  // From 4,000 onwards: steps of 1,000
  if (count > 4000) {
    const step = 1000;
    const limit = Math.ceil(count / step) * step + step;
    for (let m = 5000; m <= limit; m += step) {
      if (!milestones.includes(m)) milestones.push(m);
    }
  }

  return milestones.filter(m => m <= count).sort((a, b) => a - b);
}

/**
 * Determines the next milestone targets.
 */
export function getNextMilestone(currentMilestone) {
  const list = getMilestonesUpTo(currentMilestone + 10000);
  const currentIndex = list.indexOf(currentMilestone);
  if (currentIndex !== -1 && currentIndex < list.length - 1) {
    return list[currentIndex + 1];
  }
  // Fallbacks if not found in list
  if (currentMilestone < 200) return 200;
  if (currentMilestone < 500) return 500;
  if (currentMilestone < 1000) return 1000;
  if (currentMilestone < 2000) return currentMilestone + 500;
  return currentMilestone + 1000;
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
    const reachedNumbers = reachedMilestones.map(m => typeof m === 'object' ? m.milestone : m);

    // Find all milestones <= current count
    const eligibleMilestones = getMilestonesUpTo(memberCount);
    
    // Find unannounced ones
    const unannounced = eligibleMilestones.filter(m => !reachedNumbers.includes(m));

    if (unannounced.length === 0) {
      return; // No new milestone reached
    }

    // Select the largest new milestone to announce
    const newMilestone = Math.max(...unannounced);
    const nextMilestone = getNextMilestone(newMilestone);

    // Assign the "Milestone Legend" role to the triggering member
    await assignMilestoneLegendRole(guild, member);

    // Prepare full metadata object for the new milestone
    const newRecord = {
      milestone: newMilestone,
      userId: member.user.id,
      userTag: member.user.tag,
      userAvatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
      reachedAt: new Date().toISOString()
    };

    // Update DB: mark this milestone and all smaller ones as reached
    const updatedReached = [...reachedMilestones];
    
    // Add the new milestone object
    updatedReached.push(newRecord);
    
    // Mark any smaller/skipped milestones as resolved (with N/A metadata)
    for (const m of eligibleMilestones) {
      if (m < newMilestone && !reachedNumbers.includes(m)) {
        updatedReached.push({
          milestone: m,
          userId: 'N/A',
          userTag: 'System/Imported',
          userAvatar: null,
          reachedAt: new Date().toISOString()
        });
      }
    }

    await client.db.set(reachedKey, updatedReached);

    // Announce the milestone celebration with the glowing canvas image!
    await announceMilestoneCelebration(guild, client, newMilestone, memberCount, member, nextMilestone);

  } catch (error) {
    logger.error('Error in checkAndAnnounceMilestone:', error);
  }
}

/**
 * Assigns or creates a special gold role for the triggering member
 */
async function assignMilestoneLegendRole(guild, member) {
  if (!member) return;
  try {
    let milestoneRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'milestone legend');
    if (!milestoneRole) {
      milestoneRole = await guild.roles.create({
        name: 'Milestone Legend',
        color: '#FFD700', // Gold
        hoist: true,
        reason: 'Role created for members who trigger a server milestone'
      });
      logger.info(`Auto-created "Milestone Legend" role in guild ${guild.name}`);
    }

    await member.roles.add(milestoneRole);
    logger.info(`Assigned Milestone Legend role to user ${member.user.tag}`);
  } catch (err) {
    logger.warn(`Could not manage/assign Milestone Legend role in guild ${guild.id}: ${err.message}`);
  }
}

function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) {
    return "st";
  }
  if (j === 2 && k !== 12) {
    return "nd";
  }
  if (j === 3 && k !== 13) {
    return "rd";
  }
  return "th";
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

  // Defer generation of the card
  try {
    const avatarUrl = member ? member.user.displayAvatarURL({ extension: 'png', size: 256 }) : null;
    const username = member ? member.user.username : 'Special Guest';
    const guildIconUrl = guild.iconURL({ extension: 'png', size: 256 });

    // Generate custom canvas card
    const attachment = await generateMilestoneCard(
      avatarUrl,
      username,
      guild.name,
      guildIconUrl,
      milestone
    );

    const suffix = getOrdinalSuffix(milestone);
    const celebrationEmbed = new EmbedBuilder()
      .setColor(getColor('success', '#F1C40F')) // Gold / Success color
      .setTitle('🌟 SERVER MILESTONE ACHIEVED! 🌟')
      .setDescription(
        `## We have officially reached **${milestone.toLocaleString()}** members! 🚀\n\n` +
        `A huge thank you to our **${milestone.toLocaleString()}${suffix}** member, ${member ? member.toString() : 'someone special'}! 💖\n\n` +
        `We are incredibly grateful for each and every one of you who makes this server such a wonderful place. Our community is growing stronger, more active, and more amazing every single day! Let's keep this momentum going! ✨\n\n` +
        `🏆 **Next Target:** \`${nextMilestone.toLocaleString()}\` members! Can we hit it? Let's go! 🔥`
      )
      .setImage(`attachment://milestone-${milestone}.png`)
      .setTimestamp()
      .setFooter({ text: `${guild.name} • Journey to ${nextMilestone.toLocaleString()}`, iconURL: guildIconUrl });

    const celebrationMsg = await channel.send({ embeds: [celebrationEmbed], files: [attachment] });
    
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
