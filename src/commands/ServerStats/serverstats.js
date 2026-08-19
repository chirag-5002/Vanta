import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';
import { handlePreset } from './modules/serverstats_preset.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Manage server statistics that track member counts and channel data")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Create a new statistics tracker channel in a category")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The type of statistics to track")
                        .setRequired(true)
                        .addChoices(
                            { name: "members + bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" },
                            { name: "calendar date", value: "calendar" },
                            { name: "total traders", value: "traders" },
                            { name: "active now", value: "active" },
                            { name: "kyc verified", value: "kyc_count" },
                            { name: "total transactions", value: "transactions" },
                            { name: "usdt volume", value: "usdt_volume" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("The channel type to create for this tracker")
                        .setRequired(true)
                        .addChoices(
                            { name: "voice channel (recommended)", value: "voice" },
                            { name: "text channel", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("The category where the statistics tracker channel will be created")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addRoleOption(option =>
                    option
                        .setName("view_role")
                        .setDescription("Optional role allowed to view this channel (others will be hidden)")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List all statistics trackers for this server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("Update an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to update")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The new tracker type")
                        .setRequired(false)
                        .addChoices(
                            { name: "members + bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" },
                            { name: "calendar date", value: "calendar" },
                            { name: "total traders", value: "traders" },
                            { name: "active now", value: "active" },
                            { name: "kyc verified", value: "kyc_count" },
                            { name: "total transactions", value: "transactions" },
                            { name: "usdt volume", value: "usdt_volume" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Delete an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to delete")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup-preset")
                .setDescription("Automatically set up the complete stats category and all 6 channels")
                .addStringOption(option =>
                    option
                        .setName("category_name")
                        .setDescription("The name of the category to create (defaults to '📊 ICN=STATS')")
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName("volume_view_role")
                        .setDescription("Optional role allowed to view the USDT Volume channel (others will be hidden)")
                        .setRequired(false)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "update":
                await handleUpdate(interaction, client);
                break;
            case "delete":
                await handleDelete(interaction, client);
                break;
            case "setup-preset":
                await handlePreset(interaction, client);
                break;
            default:
                await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unknown subcommand.' });
        }
    }
};