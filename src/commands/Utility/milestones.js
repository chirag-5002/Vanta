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

export default {
    data: new SlashCommandBuilder()
        .setName('milestones')
        .setDescription('Configure and view server member milestone celebrations')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the current member count, next milestone, and reached milestones')
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
                const nextMilestone = currentMaxMilestone > 0 ? getNextMilestone(currentMaxMilestone) : 10;

                const reachedListText = reachedMilestones.length > 0
                    ? reachedMilestones.sort((a, b) => a - b).map(m => `• **${m.toLocaleString()}** members`).join('\n')
                    : '*No milestones recorded yet*';

                const embed = createEmbed({
                    title: '📊 Server Milestones Status',
                    color: getColor('info', '#3498DB'),
                    description: 
                        `**Current Member Count:** \`${memberCount.toLocaleString()}\`\n` +
                        `**Milestone Channel:** ${channelMention}\n` +
                        `**Next Milestone Target:** \`${nextMilestone.toLocaleString()}\` members\n\n` +
                        `🏆 **Achieved Milestones:**\n${reachedListText}`
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
                
                // Let's generate next milestone target for the manual celebration card
                const nextMilestone = getNextMilestone(milestoneValue);

                const success = await announceMilestoneCelebration(guild, client, milestoneValue, memberCount, interaction.member, nextMilestone);

                if (success) {
                    // Update reached database to prevent duplicate automatic announcement later
                    const reachedKey = getReachedMilestonesKey(guild.id);
                    const reachedMilestones = unwrapReplitData(await client.db.get(reachedKey)) || [];
                    if (!reachedMilestones.includes(milestoneValue)) {
                        reachedMilestones.push(milestoneValue);
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
