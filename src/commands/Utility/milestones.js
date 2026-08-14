import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { unwrapReplitData } from '../../utils/database.js';
import {
  getMilestoneChannelKey,
  getReachedMilestonesKey,
  getMilestoneChannel,
  getMilestonesUpTo,
  getNextMilestone,
  announceMilestoneCelebration
} from '../../services/milestoneService.js';

function drawProgressBar(value, max, size = 15) {
    const percentage = Math.min(Math.max(value / max, 0), 1);
    const progress = Math.round(size * percentage);
    const emptyProgress = size - progress;
    const progressText = '▰'.repeat(progress);
    const emptyProgressText = '▱'.repeat(emptyProgress);
    const percentageText = Math.round(percentage * 100);
    return `\`${progressText}${emptyProgressText}\` **${percentageText}%**`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('milestones')
        .setDescription('Configure and view server member milestone celebrations')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the current member count, next milestone progress, and Hall of Fame')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up or clear the milestone announcement channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The text channel to send milestone announcements to (leave empty to reset to auto-detection)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('Manually trigger a milestone celebration announcement')
                .addIntegerOption(option =>
                    option.setName('milestone')
                        .setDescription('The milestone member count (e.g. 500)')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('member')
                        .setDescription('The member to thank/celebrate (optional, defaults to auto-detection)')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset achieved milestones from the database to allow re-triggering')
        ),

    async execute(interaction, guildConfig, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Milestones interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'milestones'
                });
                return;
            }
        } catch (deferError) {
            logger.error(`Milestones defer error`, { error: deferError.message });
            return;
        }

        const { options, guild } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { 
                type: ErrorTypes.PERMISSION, 
                message: 'You need the **Manage Server** permission to use `/milestones`.' 
            });
        }

        const subcommand = options.getSubcommand();

        try {
            if (subcommand === 'status') {
                const memberCount = guild.memberCount;
                const reachedKey = getReachedMilestonesKey(guild.id);
                const reachedMilestones = unwrapReplitData(await client.db.get(reachedKey)) || [];

                const channel = await getMilestoneChannel(guild, client);
                const channelMention = channel ? `<#${channel.id}>` : '*None configured (falls back to auto-detection by name)*';

                const eligible = getMilestonesUpTo(memberCount);
                const currentMaxMilestone = eligible.length > 0 ? Math.max(...eligible) : 0;
                const nextMilestone = currentMaxMilestone > 0 ? getNextMilestone(currentMaxMilestone) : 200;

                // Calculate progress to next milestone
                const previousVal = currentMaxMilestone;
                const targetRange = nextMilestone - previousVal;
                const offset = memberCount - previousVal;
                const progressRange = targetRange > 0 ? targetRange : 1;
                const progressBar = drawProgressBar(offset, progressRange);

                // Build achieved milestones / Hall of Fame list
                const reachedListText = reachedMilestones.length > 0
                    ? reachedMilestones
                        .sort((a, b) => {
                            const valA = typeof a === 'object' ? a.milestone : a;
                            const valB = typeof b === 'object' ? b.milestone : b;
                            return valA - valB;
                        })
                        .map(m => {
                            if (typeof m === 'object') {
                                const triggerUser = m.userId !== 'N/A' ? `<@${m.userId}>` : `*${m.userTag}*`;
                                const dateStr = m.reachedAt ? `<t:${Math.floor(new Date(m.reachedAt).getTime() / 1000)}:d>` : '';
                                return `• 🏆 **${m.milestone.toLocaleString()}** members — Triggered by ${triggerUser} ${dateStr}`;
                            }
                            return `• 🏆 **${m.toLocaleString()}** members`;
                        })
                        .join('\n')
                    : '*No milestones recorded yet*';

                const embed = createEmbed({
                    title: '📊 Server Milestones & Hall of Fame',
                    color: getColor('info', '#3498DB'),
                    description: 
                        `**Current Member Count:** \`${memberCount.toLocaleString()}\`\n` +
                        `**Milestone Channel:** ${channelMention}\n\n` +
                        `✨ **Progress to ${nextMilestone.toLocaleString()} members:**\n` +
                        `${progressBar} (\`${memberCount.toLocaleString()}\` / \`${nextMilestone.toLocaleString()}\`)\n\n` +
                        `🏆 **Milestones Hall of Fame:**\n${reachedListText}`
                });

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
                return;
            }

            if (subcommand === 'setup') {
                const channel = options.getChannel('channel');
                const key = getMilestoneChannelKey(guild.id);

                if (channel) {
                    await client.db.set(key, channel.id);
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Milestones Channel Setup', `Milestone announcements will now be sent to <#${channel.id}>.`)]
                    }).catch(logger.error);
                } else {
                    await client.db.delete(key);
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Milestones Channel Reset', `Explicit channel configuration removed. The system will fall back to auto-detecting text channels named \`milestone\` or \`milestones\`.`)]
                    }).catch(logger.error);
                }
                return;
            }

            if (subcommand === 'announce') {
                const milestoneValue = options.getInteger('milestone');
                const memberCount = guild.memberCount;
                const nextMilestone = getNextMilestone(milestoneValue);

                const targetUser = options.getUser('member');
                let targetMember = null;

                if (targetUser) {
                    targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
                } else {
                    try {
                        const members = await guild.members.fetch();
                        const sortedMembers = Array.from(members.values()).sort(
                            (a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0)
                        );
                        // milestoneValue is 1-indexed, so we subtract 1 to get the 0-indexed position
                        targetMember = sortedMembers[milestoneValue - 1] || null;
                    } catch (err) {
                        logger.error('Error auto-detecting milestone member:', err);
                    }
                }

                const success = await announceMilestoneCelebration(guild, client, milestoneValue, memberCount, targetMember, nextMilestone);

                if (success) {
                    // Update reached database to prevent duplicate automatic announcement later
                    const reachedKey = getReachedMilestonesKey(guild.id);
                    const reachedMilestones = unwrapReplitData(await client.db.get(reachedKey)) || [];
                    const reachedNumbers = reachedMilestones.map(m => typeof m === 'object' ? m.milestone : m);

                    if (!reachedNumbers.includes(milestoneValue)) {
                        reachedMilestones.push({
                          milestone: milestoneValue,
                          userId: targetMember ? targetMember.user.id : 'N/A',
                          userTag: targetMember ? targetMember.user.tag : 'System/Imported',
                          userAvatar: targetMember ? targetMember.user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
                          reachedAt: new Date().toISOString()
                        });
                        await client.db.set(reachedKey, reachedMilestones);
                    }

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed('Milestone Announcement Sent', `Successfully sent the celebration announcement for **${milestoneValue.toLocaleString()}** members!`)]
                    }).catch(logger.error);
                } else {
                    await replyUserError(interaction, { 
                        type: ErrorTypes.UNKNOWN, 
                        message: 'Failed to send milestone announcement. Make sure a milestone channel exists (auto-detected or configured) and that the bot has permissions to send messages and embed links there.' 
                    }).catch(logger.error);
                }
                return;
            }

            if (subcommand === 'reset') {
                const reachedKey = getReachedMilestonesKey(guild.id);
                await client.db.delete(reachedKey);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Milestones Reset Success', `All recorded milestone achievements for this server have been cleared from the database.`)]
                }).catch(logger.error);
                return;
            }

        } catch (error) {
            logger.error(`Error in /milestones execution:`, error);
            await replyUserError(interaction, { 
                type: ErrorTypes.UNKNOWN, 
                message: 'An error occurred while executing the command. Please try again.' 
            }).catch(logger.error);
        }
    }
};
