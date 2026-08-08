import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { getP2PConfig, saveP2PConfig, logDeal, buildDealEmbed, buildDealComponents, getUserP2PStats, getGuildP2PStats } from '../../services/p2pService.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, getP2PDealsKey } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('p2p')
        .setDescription('P2P USDT transaction deal logging and proof system.')
        .setDMPermission(false)

        // Subcommand: Log a completed deal
        .addSubcommand(subcommand =>
            subcommand
                .setName('deal')
                .setDescription('Logs a completed P2P transaction and posts proof embed.')
                .addUserOption(option =>
                    option.setName('buyer')
                        .setDescription('The buyer in this P2P transaction')
                        .setRequired(true)
                )
                .addUserOption(option =>
                    option.setName('seller')
                        .setDescription('The seller in this P2P transaction')
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName('usdt_amount')
                        .setDescription('USDT amount traded (e.g. 75.00)')
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName('usd_amount')
                        .setDescription('USD equivalent amount (e.g. 75.00, defaults to USDT amount)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('tx_hash')
                        .setDescription('Transaction Tx Hash / Explorer URL')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('deal_info')
                        .setDescription('Deal description (e.g., "3x mbk wallet", "USDT to INR")')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Transaction status')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Completed', value: 'Completed' },
                            { name: 'In Progress', value: 'In Progress' },
                            { name: 'Refunded', value: 'Refunded' }
                        )
                )
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Specific channel to post the proof embed in')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )

        // Subcommand: Setup & Configure P2P deal system
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configures P2P deal logging channel, vouch channel, and staff roles.')
                .addChannelOption(option =>
                    option.setName('deal_channel')
                        .setDescription('Public channel where successful deal proofs will be posted')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addChannelOption(option =>
                    option.setName('vouch_channel')
                        .setDescription('Channel where user vouches and feedback will be posted')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('staff_role')
                        .setDescription('Middleman / Staff role authorized to log deals')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('footer')
                        .setDescription('Custom embed footer text (e.g., "Auto-MM Successful Deal")')
                        .setRequired(false)
                )
        )

        // Subcommand: View trade stats
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Displays P2P trade statistics for a user or the server.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to view P2P trade statistics for')
                        .setRequired(false)
                )
        )

        // Subcommand: View trade history
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View recent P2P deal transaction log history.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Filter deal history by user')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of past deals to show (max 10, default 5)')
                        .setRequired(false)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            return await handleSetup(interaction);
        }

        if (subcommand === 'deal') {
            return await handleDeal(interaction);
        }

        if (subcommand === 'stats') {
            return await handleStats(interaction);
        }

        if (subcommand === 'history') {
            return await handleHistory(interaction);
        }
    }
};

/**
 * Handle P2P setup configuration
 */
async function handleSetup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need the `Manage Server` permission to configure P2P system settings.'
        });
    }

    const dealChannel = interaction.options.getChannel('deal_channel');
    const vouchChannel = interaction.options.getChannel('vouch_channel');
    const staffRole = interaction.options.getRole('staff_role');
    const footerText = interaction.options.getString('footer');

    const updateObj = {};
    if (dealChannel) updateObj.dealChannelId = dealChannel.id;
    if (vouchChannel) updateObj.vouchChannelId = vouchChannel.id;
    if (staffRole) updateObj.staffRoleId = staffRole.id;
    if (footerText) updateObj.footerText = footerText;

    if (Object.keys(updateObj).length === 0) {
        const currentConfig = await getP2PConfig(interaction.guildId);
        const dealChanStr = currentConfig.dealChannelId ? `<#${currentConfig.dealChannelId}>` : 'Not Set';
        const vouchChanStr = currentConfig.vouchChannelId ? `<#${currentConfig.vouchChannelId}>` : 'Not Set';
        const staffRoleStr = currentConfig.staffRoleId ? `<@&${currentConfig.staffRoleId}>` : 'None (Admins Only)';

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'P2P System Configuration',
                    `**Current Settings:**\n` +
                    `• **Deal Log Channel:** ${dealChanStr}\n` +
                    `• **Vouch Channel:** ${vouchChanStr}\n` +
                    `• **Staff / Middleman Role:** ${staffRoleStr}\n` +
                    `• **Footer Label:** \`${currentConfig.footerText}\`_\n\n` +
                    `Use options in \`/p2p setup\` to update these settings.`
                )
            ]
        });
    }

    const saved = await saveP2PConfig(interaction.guildId, updateObj);

    const changes = [];
    if (dealChannel) changes.push(`• **Deal Log Channel:** <#${dealChannel.id}>`);
    if (vouchChannel) changes.push(`• **Vouch Channel:** <#${vouchChannel.id}>`);
    if (staffRole) changes.push(`• **Staff Role:** <@&${staffRole.id}>`);
    if (footerText) changes.push(`• **Footer Label:** \`${footerText}\``);

    logger.info('P2P system configuration updated', {
        guildId: interaction.guildId,
        updatedBy: interaction.user.id,
        changes: updateObj
    });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'P2P Setup Updated',
                `Successfully updated P2P settings for this server:\n\n${changes.join('\n')}`
            )
        ]
    });
}

/**
 * Handle logging a completed P2P transaction deal
 */
async function handleDeal(interaction) {
    const config = await getP2PConfig(interaction.guildId);

    // Permission check
    const hasManageGuild = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    const hasStaffRole = config.staffRoleId ? interaction.member.roles.cache.has(config.staffRoleId) : false;

    if (!hasManageGuild && !hasStaffRole) {
        const requiredMsg = config.staffRoleId
            ? `You need the <@&${config.staffRoleId}> role or \`Manage Server\` permission to log deals.`
            : 'You need the `Manage Server` permission to log P2P deals. (Or configure a staff role using `/p2p setup`).';

        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: requiredMsg
        });
    }

    const buyer = interaction.options.getUser('buyer');
    const seller = interaction.options.getUser('seller');
    const usdtAmount = interaction.options.getNumber('usdt_amount');
    const usdAmount = interaction.options.getNumber('usd_amount') || usdtAmount;
    const txHash = interaction.options.getString('tx_hash');
    const dealInfo = interaction.options.getString('deal_info');
    const status = interaction.options.getString('status') || 'Completed';
    const channelOverride = interaction.options.getChannel('channel');

    // Determine target channel
    const targetChannel = channelOverride || (config.dealChannelId ? interaction.guild.channels.cache.get(config.dealChannelId) : interaction.channel);

    if (!targetChannel) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Target deal logging channel was not found. Please specify a channel option or configure one via `/p2p setup`.'
        });
    }

    // Save deal record
    const dealRecord = await logDeal(interaction.guildId, {
        buyerId: buyer.id,
        sellerId: seller.id,
        usdtAmount,
        usdAmount,
        txHash,
        dealInfo,
        status,
        loggedBy: interaction.user.id
    });

    // Build embed & components matching exact design
    const dealEmbed = buildDealEmbed(dealRecord, config);
    const componentsRow = buildDealComponents(config.vouchChannelId, dealRecord.dealId);

    let sentMsg;
    try {
        sentMsg = await targetChannel.send({
            embeds: [dealEmbed],
            components: [componentsRow]
        });

        // Save message ID to deal record
        dealRecord.messageId = sentMsg.id;
        dealRecord.channelId = targetChannel.id;
    } catch (err) {
        logger.error('Failed to post P2P deal embed to target channel', { error: err.message, channelId: targetChannel.id });
        return await replyUserError(interaction, {
            type: ErrorTypes.DISCORD_API,
            message: `Failed to post the transaction embed in <#${targetChannel.id}>. Make sure the bot has permission to Send Messages and Embed Links.`
        });
    }

    logger.info('P2P Deal logged successfully', {
        dealId: dealRecord.dealId,
        guildId: interaction.guildId,
        buyerId: buyer.id,
        sellerId: seller.id,
        usdtAmount,
        targetChannelId: targetChannel.id
    });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'Transaction Logged Successfully!',
                `The transaction proof embed has been posted in <#${targetChannel.id}>.\n\n` +
                `• **Deal ID:** \`${dealRecord.dealId}\`\n` +
                `• **Parties:** ${buyer} ↔️ ${seller}\n` +
                `• **Amount:** $${usdAmount.toFixed(2)} USD / ${usdtAmount} USDT\n` +
                `• **Status:** \`${status}\``
            )
        ]
    });
}

/**
 * Handle P2P stats display
 */
async function handleStats(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
        const stats = await getUserP2PStats(interaction.guildId, targetUser.id);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    `P2P Trade Stats for ${targetUser.username}`,
                    `• **Completed Deals:** \`${stats.completedDeals}\` / \`${stats.totalDeals}\` total\n` +
                    `• **Total USDT Volume:** \`${stats.totalUsdtVolume.toFixed(2)} USDT\`\n` +
                    `• **Last Trade:** ${stats.lastDealTimestamp ? `<t:${Math.floor(new Date(stats.lastDealTimestamp).getTime() / 1000)}:R>` : 'Never'}`
                )
            ]
        });
    } else {
        const guildStats = await getGuildP2PStats(interaction.guildId);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    `Server P2P Transaction Statistics`,
                    `• **Total Completed Deals:** \`${guildStats.completedDeals}\` deals\n` +
                    `• **Total P2P Volume Processed:** \`${guildStats.totalUsdtVolume.toFixed(2)} USDT\`\n\n` +
                    `*P2P transactions logged via TitanBot Middleman system.*`
                )
            ]
        });
    }
}

/**
 * Handle P2P history display
 */
async function handleHistory(interaction) {
    const targetUser = interaction.options.getUser('user');
    const limit = Math.min(interaction.options.getInteger('limit') || 5, 10);

    const dealsKey = getP2PDealsKey(interaction.guildId);
    let deals = await getFromDb(dealsKey, []);

    if (targetUser) {
        deals = deals.filter(d => d.buyerId === targetUser.id || d.sellerId === targetUser.id);
    }

    if (deals.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('No Deals Found', 'No transaction deals have been recorded yet.')]
        });
    }

    const recentDeals = deals.slice(-limit).reverse();
    const lines = recentDeals.map(d => {
        const timeStr = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
        return `• \`${d.dealId}\` | <@${d.buyerId}> & <@${d.sellerId}> | **${d.usdtAmount} USDT** ($${d.usdAmount}) | \`${d.status}\` (${timeStr})`;
    });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            infoEmbed(
                targetUser ? `P2P Deal History for ${targetUser.username}` : 'Recent Server P2P Deals',
                lines.join('\n\n')
            )
        ]
    });
}
