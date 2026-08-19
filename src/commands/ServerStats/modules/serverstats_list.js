import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getCounterCount } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to view counters.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "Server Counters",
                description: "No counters have been set up for this server yet.\n\nUse `/serverstats create` to set up your first counter!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**Available Counter Types**",
                value: "**Members + Bots** - Total server members (`members`)\n" +
                       "**Members Only** - Human members only (`members_only`)\n" +
                       "**Bots Only** - Bot members only (`bots`)\n" +
                       "**Calendar Date** - Sidebar date tracker (`calendar`)\n" +
                       "**Total Traders** - P2P traders count (`traders`)\n" +
                       "**Active Now** - Online members (`active`)\n" +
                       "**KYC Verified** - KYC verified users count (`kyc_count`)\n" +
                       "**Total Transactions** - Completed P2P transactions (`transactions`)\n" +
                       "**USDT Volume** - Total USDT volume processed (`usdt_volume`)",
                inline: false
            });

            embed.addFields({
                name: "**Usage Examples**",
                value: "`/serverstats create type:members channel_type:voice category:Stats`\n" +
                       "`/serverstats create type:usdt_volume channel_type:voice category:Stats view_role:@VIP`\n" +
                       "`/serverstats list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Counter System • Automatic updates every 15 minutes" 
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `Server Counters (${validCounters.length})`,
            description: "Here are all the active counters for this server.\n\nCounters automatically update every 15 minutes.",
            color: getColor('info')
        });

        const counterFieldsPromises = validCounters.map(async (counter, index) => {
            const channel = guild.channels.cache.get(counter.channelId);
            if (!channel) return null;

            const rawCount = await getCounterCount(guild, counter.type);
            const currentCount = typeof rawCount === 'number' ? rawCount.toLocaleString('en-US') : rawCount;
            const status = (channel.name.includes(':') || channel.name.includes('·')) ? '✅ Active' : '⚠️ Not Updated';
            const viewRoleText = counter.viewRoleId ? `\n**Restricted Role:** <@&${counter.viewRoleId}>` : '';

            return {
                name: `${getCounterTypeEmoji(counter.type)} Counter #${index + 1} - ${channel.name}`,
                value: `**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}\n**Channel:** ${channel}\n**Current Value:** ${currentCount}${viewRoleText}\n**Status:** ${status}\n**Created:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            };
        });

        const counterFields = (await Promise.all(counterFieldsPromises)).filter(Boolean);
        embed.addFields(counterFields);

        embed.addFields({
            name: "**Statistics**",
            value: `**Total Counters:** ${validCounters.length}\n**Active Counters:** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && (channel.name.includes(':') || channel.name.includes('·'));
            }).length}\n**Next Update:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Management Commands**",
            value: "`/serverstats create` - Create new counter\n`/serverstats update` - Update existing counter\n`/serverstats delete` - Delete counter",
            inline: false
        });

        embed.setFooter({ 
            text: "Counter System • Automatic updates every 15 minutes" 
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while fetching counters. Please try again.' }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}