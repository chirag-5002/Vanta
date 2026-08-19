import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handlePreset(interaction, client) {
    const guild = interaction.guild;
    const categoryName = interaction.options.getString("category_name") || "📊 ICN=STATS";
    const volumeViewRole = interaction.options.getRole("volume_view_role");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to run stats setup.' }).catch(logger.error);
        return;
    }

    try {
        // 1. Create the category channel at the very top
        const category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            position: 0,
            reason: `Stats Preset Category created by ${interaction.user.tag}`
        });

        // 2. Define the 6 stats preset channels
        const presets = [
            { type: 'calendar', restrict: false },
            { type: 'traders', restrict: false },
            { type: 'active', restrict: false },
            { type: 'kyc_count', restrict: false },
            { type: 'transactions', restrict: false },
            { type: 'usdt_volume', restrict: true }
        ];

        const counters = await getServerCounters(client, guild.id);
        const createdChannels = [];
        const baseTime = Date.now();

        for (let i = 0; i < presets.length; i++) {
            const preset = presets[i];

            // Avoid creating duplicate types if one already exists
            const duplicate = counters.find(c => c.type === preset.type);
            if (duplicate) {
                continue;
            }

            const baseChannelName = getCounterBaseName(preset.type);
            const permissionOverwrites = [];

            // If it is the restricted USDT Volume channel, apply overwrites
            if (preset.restrict && volumeViewRole) {
                permissionOverwrites.push(
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: volumeViewRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
                    }
                );
            }

            const channel = await guild.channels.create({
                name: baseChannelName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: permissionOverwrites.length > 0 ? permissionOverwrites : undefined,
                reason: `Stats Preset Counter Channel (${preset.type}) created by ${interaction.user.tag}`
            });

            const newCounter = {
                id: (baseTime + i).toString(),
                type: preset.type,
                channelId: channel.id,
                guildId: guild.id,
                createdAt: new Date().toISOString(),
                enabled: true,
                viewRoleId: (preset.restrict && volumeViewRole) ? volumeViewRole.id : null
            };

            counters.push(newCounter);
            createdChannels.push({ channel, counter: newCounter });
        }

        // Save to DB
        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            for (const { channel } of createdChannels) {
                await channel.delete().catch(() => null);
            }
            await category.delete().catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to save preset statistics database data. Rollback complete.' }).catch(logger.error);
            return;
        }

        // Apply immediately
        for (const { channel, counter } of createdChannels) {
            await updateCounter(client, guild, counter);
        }

        const successMessage = `**Stats Preset Configured Successfully!**\n\n` +
            `• Created category: ${category}\n` +
            `• Created **${createdChannels.length}** counter channels inside it.\n` +
            (volumeViewRole ? `• Restricted **USDT Volume** visibility to: ${volumeViewRole}\n` : '') +
            `\nThese channels will automatically update every 15 minutes! Use \`/serverstats list\` to manage them.`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(successMessage)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error setting up stats preset:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while deploying the stats preset. Please verify bot channel permissions.' }).catch(logger.error);
    }
}
