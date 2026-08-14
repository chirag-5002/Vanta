import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getP2PConfig, saveP2PConfig, getP2PPaymentConfig, saveP2PPaymentConfig, logDeal, buildDealEmbed, buildDealComponents, getUserP2PStats, getGuildP2PStats, autoDetectDealFromChannel, buildPriceUpdateEmbed, buildPriceComponents } from '../../services/p2pService.js';
import { getTicketData, saveTicketData, deleteFromDb } from '../../utils/database.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('p2p')
        .setDescription('P2P USDT transaction deal logging, market prices, and ticket system.')
        .setDMPermission(false)

        // Subcommand: Configure Payment Accounts & Deposit Wallets
        .addSubcommand(subcommand =>
            subcommand
                .setName('payments')
                .setDescription('Configures UPI ID, Bank IMPS, CDM, and Crypto Deposit Wallets for automatic dispatch.')
                .addStringOption(option =>
                    option.setName('upi_id')
                        .setDescription('UPI ID for Buy USDT payments (e.g. name@upi)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('upi_qr_url')
                        .setDescription('UPI QR Code Image URL')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('imps_account')
                        .setDescription('IMPS Bank Account Number')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('imps_ifsc')
                        .setDescription('IMPS IFSC Code')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('imps_name')
                        .setDescription('IMPS Bank Account Holder Name')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('cdm_account')
                        .setDescription('CDM Cash Deposit Account Details')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('trc20_wallet')
                        .setDescription('USDT TRC20 Deposit Wallet Address')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('erc20_wallet')
                        .setDescription('USDT ERC20 Deposit Wallet Address')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('bep20_wallet')
                        .setDescription('USDT BEP20 Deposit Wallet Address')
                        .setRequired(false)
                )
        )

        // Subcommand: Post Buy/Sell USDT Ticket Creation Panel
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Posts an interactive Buy USDT & Sell USDT ticket panel in any channel.')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Target channel for ticket panel (e.g. #how-to-buy)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Custom panel header title')
                        .setRequired(false)
                )
        )

        // Subcommand: Post real-time Market Price Update
        .addSubcommand(subcommand =>
            subcommand
                .setName('price')
                .setDescription('Posts an ultra-professional USDT Buy/Sell market price update.')
                .addNumberOption(option =>
                    option.setName('buy_price')
                        .setDescription('Buy rate per USDT (e.g. 102.5)')
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName('sell_price')
                        .setDescription('Sell rate per USDT (e.g. 97.5)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('currency')
                        .setDescription('Currency symbol (Default: ₹ INR)')
                        .setRequired(false)
                        .addChoices(
                            { name: '₹ (INR)', value: '₹' },
                            { name: '$ (USD)', value: '$' },
                            { name: '€ (EUR)', value: '€' },
                            { name: '£ (GBP)', value: '£' },
                            { name: '₨ (PKR)', value: '₨' }
                        )
                )
                .addStringOption(option =>
                    option.setName('ping')
                        .setDescription('Ping option for price update message')
                        .setRequired(false)
                        .addChoices(
                            { name: 'None', value: 'none' },
                            { name: '@everyone', value: '@everyone' },
                            { name: '@here', value: '@here' }
                        )
                )
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Target price channel (e.g. #usdt-price)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('payment_methods')
                        .setDescription('Custom payment methods (e.g. "UPI • IMPS • GPay • Bank Transfer")')
                        .setRequired(false)
                )
        )

        // Subcommand: Auto-detect & log deal from current channel messages
        .addSubcommand(subcommand =>
            subcommand
                .setName('autolog')
                .setDescription('Auto-detects transaction details from current ticket messages and posts proof.')
                .addUserOption(option =>
                    option.setName('buyer')
                        .setDescription('Override buyer (optional, auto-detected if left empty)')
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option.setName('seller')
                        .setDescription('Override seller (optional, auto-detected if left empty)')
                        .setRequired(false)
                )
        )

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
                        .setDescription('USDT amount traded (e.g. 75 or 2500)')
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName('usd_amount')
                        .setDescription('USD value (Optional, defaults to USDT amount if 1:1)')
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
                        .setDescription('Custom embed footer text (e.g., "ICN Verified Successful Deal")')
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
        )
        // Subcommand: Reset User P2P Limits
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription("Resets a user's P2P limits (daily ticket count, ban, and timepass count).")
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset P2P limits for')
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'deal') {
            const deferred = await InteractionHelper.safeDefer(interaction, {});
            if (!deferred) return;
            return await handleDeal(interaction);
        }

        if (subcommand === 'autolog') {
            const deferred = await InteractionHelper.safeDefer(interaction, {});
            if (!deferred) return;
            return await handleAutoLog(interaction);
        }

        if (subcommand === 'price') {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;
            return await handlePriceUpdate(interaction);
        }

        if (subcommand === 'panel') {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;
            return await handleTicketPanel(interaction);
        }

        if (subcommand === 'payments') {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;
            return await handlePaymentConfig(interaction);
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        if (subcommand === 'setup') {
            return await handleSetup(interaction);
        }

        if (subcommand === 'stats') {
            return await handleStats(interaction);
        }

        if (subcommand === 'history') {
            return await handleHistory(interaction);
        }

        if (subcommand === 'reset') {
            return await handleReset(interaction);
        }
    }
};

/**
 * Handle payment accounts configuration
 */
async function handlePaymentConfig(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need `Manage Server` permission to configure payment accounts.'
        });
    }

    const upiId = interaction.options.getString('upi_id');
    const upiQrUrl = interaction.options.getString('upi_qr_url');
    const impsAccount = interaction.options.getString('imps_account');
    const impsIfsc = interaction.options.getString('imps_ifsc');
    const impsName = interaction.options.getString('imps_name');
    const cdmAccount = interaction.options.getString('cdm_account');
    const trc20Wallet = interaction.options.getString('trc20_wallet');
    const erc20Wallet = interaction.options.getString('erc20_wallet');
    const bep20Wallet = interaction.options.getString('bep20_wallet');

    const updateObj = {};
    if (upiId) updateObj.upiId = upiId;
    if (upiQrUrl) updateObj.upiQrUrl = upiQrUrl;
    if (impsAccount) updateObj.impsAccount = impsAccount;
    if (impsIfsc) updateObj.impsIfsc = impsIfsc;
    if (impsName) updateObj.impsName = impsName;
    if (cdmAccount) updateObj.cdmAccount = cdmAccount;
    if (trc20Wallet) updateObj.trc20Wallet = trc20Wallet;
    if (erc20Wallet) updateObj.erc20Wallet = erc20Wallet;
    if (bep20Wallet) updateObj.bep20Wallet = bep20Wallet;

    if (Object.keys(updateObj).length === 0) {
        const current = await getP2PPaymentConfig(interaction.guildId);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'P2P Payment & Deposit Wallet Configuration',
                    `**Configured Automated Accounts:**\n` +
                    `• **UPI ID:** \`${current.upiId}\`\n` +
                    `• **IMPS Bank Account:** \`${current.impsAccount}\` (IFSC: \`${current.impsIfsc}\` - \`${current.impsName}\`)\n` +
                    `• **CDM Account:** \`${current.cdmAccount}\`\n` +
                    `• **TRC20 Deposit Wallet:** \`${current.trc20Wallet}\`\n` +
                    `• **ERC20 Deposit Wallet:** \`${current.erc20Wallet}\`\n` +
                    `• **BEP20 Deposit Wallet:** \`${current.bep20Wallet}\`\n\n` +
                    `Use options in \`/p2p payments\` to update any of these details.`
                )
            ]
        });
    }

    await saveP2PPaymentConfig(interaction.guildId, updateObj);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'Payment Accounts Updated!',
                'Successfully saved your automated payment & deposit wallet details!'
            )
        ]
    });
}

/**
 * Handle Posting P2P Ticket Creation Panel
 */
async function handleTicketPanel(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need `Manage Server` permission to post the P2P ticket panel.'
        });
    }

    const customTitle = interaction.options.getString('title') || '🛒 USDT P2P Trade Portal';
    const channelOverride = interaction.options.getChannel('channel');
    const targetChannel = channelOverride || interaction.channel;

    const channelName = targetChannel.name?.toLowerCase() || '';
    const isBuyChannel = channelName.includes('buy') || channelName.includes('looking-to-buy');
    const isSellChannel = channelName.includes('sell') || channelName.includes('looking-to-sell');

    let panelEmbed, buttonsRow;

    if (isBuyChannel) {
        panelEmbed = new EmbedBuilder()
            .setTitle(customTitle === '🛒 USDT P2P Trade Portal' ? '🟢 Buy USDT - P2P Portal' : customTitle)
            .setDescription(
                `Welcome to **${interaction.guild.name}** USDT Buying Portal!\n\n` +
                `Select an option below to open an instant 1-on-1 Middleman Buy Ticket:\n\n` +
                `• **🟢 Buy with KYC:** Only **0.1% fee** (You receive **99.9%** of requested USDT).\n` +
                `• **🟢 Buy without KYC:** Standard **1% fee** (You receive **99%** of requested USDT).\n\n` +
                `*🛡️ All trades are 100% protected by ICN Auto-MM Security.*`
            )
            .setColor('#2ECC71')
            .setFooter({ text: `${interaction.guild.name} • Official P2P Buy Portal` });

        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_trade_buy_kyc')
                .setLabel('🟢 Buy with KYC')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('p2p_trade_buy_nokyc')
                .setLabel('🟢 Buy without KYC')
                .setStyle(ButtonStyle.Primary)
        );
    } else if (isSellChannel) {
        panelEmbed = new EmbedBuilder()
            .setTitle(customTitle === '🛒 USDT P2P Trade Portal' ? '🔴 Sell USDT - P2P Portal' : customTitle)
            .setDescription(
                `Welcome to **${interaction.guild.name}** USDT Selling Portal!\n\n` +
                `Select an option below to open an instant 1-on-1 Middleman Sell Ticket:\n\n` +
                `• **🔴 Sell with KYC:** Full rate payout (Flat ₹100 network fee deducted).\n` +
                `• **🔴 Sell without KYC:** **1% fee** deducted on your USDT before payout calculation.\n\n` +
                `*🛡️ All trades are 100% protected by ICN Auto-MM Security.*`
            )
            .setColor('#E74C3C')
            .setFooter({ text: `${interaction.guild.name} • Official P2P Sell Portal` });

        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_trade_sell_kyc')
                .setLabel('🔴 Sell with KYC')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('p2p_trade_sell_nokyc')
                .setLabel('🔴 Sell without KYC')
                .setStyle(ButtonStyle.Primary)
        );
    } else {
        panelEmbed = new EmbedBuilder()
            .setTitle(customTitle)
            .setDescription(
                `Welcome to **${interaction.guild.name}** P2P Exchange Portal!\n\n` +
                `Need to **Buy** or **Sell** USDT securely?\n` +
                `Click one of the buttons below to open a private 1-on-1 Middleman Trade Ticket with our verified support team!\n\n` +
                `• **🟢 Buy USDT:** Open ticket to buy USDT via INR/UPI/Bank.\n` +
                `• **🔴 Sell USDT:** Open ticket to sell USDT and receive instant payout.\n\n` +
                `*🛡️ All transactions are 100% protected by ICN Auto-MM Security.*`
            )
            .setColor('#FFC107')
            .setFooter({ text: `${interaction.guild.name} • Official P2P Trade System` });

        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_price_buy')
                .setLabel('🟢 Buy USDT')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('p2p_price_sell')
                .setLabel('🔴 Sell USDT')
                .setStyle(ButtonStyle.Danger)
        );
    }

    try {
        await targetChannel.send({
            embeds: [panelEmbed],
            components: [buttonsRow]
        });
    } catch (err) {
        logger.error('Failed to post ticket panel:', err);
        return await replyUserError(interaction, {
            type: ErrorTypes.DISCORD_API,
            message: `Failed to post panel in <#${targetChannel.id}>.`
        });
    }

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'P2P Ticket Panel Posted!',
                `The interactive **Buy USDT & Sell USDT** Ticket Panel has been published to <#${targetChannel.id}>!`
            )
        ]
    });
}

/**
 * Handle posting Market Price Update
 */
async function handlePriceUpdate(interaction) {
    const config = await getP2PConfig(interaction.guildId);

    const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
    const hasStaffRole = config.staffRoleId && interaction.member
        ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(config.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.staffRoleId))
        : false;

    if (!hasManageGuild && !hasStaffRole) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need permission to post price updates.'
        });
    }

    const buyPrice = interaction.options.getNumber('buy_price');
    const sellPrice = interaction.options.getNumber('sell_price');
    const symbol = interaction.options.getString('currency') || '₹';
    const pingOption = interaction.options.getString('ping') || 'none';
    const channelOverride = interaction.options.getChannel('channel');
    const paymentMethods = interaction.options.getString('payment_methods');

    // Update config cache for prices so bot remembers them
    config.lastBuyPrice = buyPrice;
    config.lastSellPrice = sellPrice;
    await saveP2PConfig(interaction.guildId, config).catch(() => null);

    const targetChannel = channelOverride || (config.priceChannelId ? interaction.guild.channels.cache.get(config.priceChannelId) : interaction.channel);

    if (!targetChannel) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Target price channel was not found.'
        });
    }

    const priceEmbed = buildPriceUpdateEmbed({
        buyPrice,
        sellPrice,
        symbol,
        paymentMethods
    }, interaction.guild.name || 'ICN Network');

    const { resolveP2PChannels } = await import('../../services/p2pService.js');
    const p2pChannels = resolveP2PChannels(interaction.guild);
    const componentsRow = buildPriceComponents(
        config.vouchChannelId,
        interaction.guildId,
        p2pChannels.buyChannelId,
        p2pChannels.sellChannelId
    );

    let contentPayload = {};
    if (pingOption === '@everyone') {
        contentPayload.content = '@everyone';
    } else if (pingOption === '@here') {
        contentPayload.content = '@here';
    }

    try {
        await targetChannel.send({
            ...contentPayload,
            embeds: [priceEmbed],
            components: [componentsRow]
        });
    } catch (err) {
        logger.error('Failed to post price update embed', { error: err.message, channelId: targetChannel.id });
        return await replyUserError(interaction, {
            type: ErrorTypes.DISCORD_API,
            message: `Failed to post price update in <#${targetChannel.id}>.`
        });
    }

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'Market Price Update Published!',
                `The live USDT Market Price Update has been posted to <#${targetChannel.id}>!\n\n` +
                `• **Buy Rate:** ${symbol} ${buyPrice}\n` +
                `• **Sell Rate:** ${symbol} ${sellPrice}\n` +
                `• **Ping:** \`${pingOption}\``
            )
        ]
    });
}

/**
 * Handle Auto-Detection of P2P Deal from Channel Messages
 */
async function handleAutoLog(interaction) {
    const config = await getP2PConfig(interaction.guildId);

    const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
    const hasStaffRole = config.staffRoleId && interaction.member
        ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(config.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.staffRoleId))
        : false;

    if (!hasManageGuild && !hasStaffRole) {
        return await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'You need permission to run auto-log.'
        });
    }

    const detected = await autoDetectDealFromChannel(interaction.channel, interaction.guildId);

    const overrideBuyer = interaction.options.getUser('buyer');
    const overrideSeller = interaction.options.getUser('seller');

    const buyerId = overrideBuyer ? overrideBuyer.id : (detected.buyerId || interaction.user.id);
    const sellerId = overrideSeller ? overrideSeller.id : (detected.sellerId || interaction.user.id);

    const targetChannel = config.dealChannelId ? interaction.guild.channels.cache.get(config.dealChannelId) : interaction.channel;

    const dealRecord = await logDeal(interaction.guildId, {
        buyerId,
        sellerId,
        usdtAmount: detected.usdtAmount,
        usdAmount: detected.usdAmount,
        txHash: detected.txHash,
        dealInfo: detected.dealInfo,
        status: 'Completed',
        loggedBy: interaction.user.id
    });

    const ticketData = await getTicketData(interaction.guildId, interaction.channel.id).catch(() => null);
    if (ticketData) {
        ticketData.dealCompleted = true;
        await saveTicketData(interaction.guildId, interaction.channel.id, ticketData).catch(() => null);
    }

    const dealEmbed = buildDealEmbed(dealRecord, config, null, interaction.guild);

    if (targetChannel && targetChannel.id !== interaction.channel?.id) {
        const sentMsg = await targetChannel.send({
            embeds: [dealEmbed]
        });
        dealRecord.messageId = sentMsg.id;
        dealRecord.channelId = targetChannel.id;

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Auto-Log Successful!',
                    `Auto-scanned ticket channel and published permanent deal proof to <#${targetChannel.id}>!`
                )
            ]
        });
    } else {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [dealEmbed],
            components: [componentsRow]
        });
    }
}

/**
 * Handle P2P setup configuration
 */
async function handleSetup(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
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

    await saveP2PConfig(interaction.guildId, updateObj);

    const changes = [];
    if (dealChannel) changes.push(`• **Deal Log Channel:** <#${dealChannel.id}>`);
    if (vouchChannel) changes.push(`• **Vouch Channel:** <#${vouchChannel.id}>`);
    if (staffRole) changes.push(`• **Staff Role:** <@&${staffRole.id}>`);
    if (footerText) changes.push(`• **Footer Label:** \`${footerText}\``);

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

    const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
    const hasStaffRole = config.staffRoleId && interaction.member
        ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(config.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.staffRoleId))
        : false;

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

    const targetChannel = channelOverride || (config.dealChannelId ? interaction.guild.channels.cache.get(config.dealChannelId) : interaction.channel);

    if (!targetChannel) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Target deal logging channel was not found. Please specify a channel option or configure one via `/p2p setup`.'
        });
    }

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

    const ticketData = await getTicketData(interaction.guildId, interaction.channel.id).catch(() => null);
    if (ticketData) {
        ticketData.dealCompleted = true;
        await saveTicketData(interaction.guildId, interaction.channel.id, ticketData).catch(() => null);
    }

    const dealEmbed = buildDealEmbed(dealRecord, config, null, interaction.guild);

    if (targetChannel.id !== interaction.channel?.id) {
        let sentMsg;
        try {
            sentMsg = await targetChannel.send({
                embeds: [dealEmbed]
            });
            dealRecord.messageId = sentMsg.id;
            dealRecord.channelId = targetChannel.id;
        } catch (err) {
            logger.error('Failed to post P2P deal embed to target channel', { error: err.message, channelId: targetChannel.id });
            return await replyUserError(interaction, {
                type: ErrorTypes.DISCORD_API,
                message: `Failed to post the transaction embed in <#${targetChannel.id}>. Make sure the bot has permission to Send Messages and Embed Links.`
            });
        }

        if (interaction.channel) {
            const successEmbedObj = new EmbedBuilder()
                .setTitle('🎉 Transaction Complete')
                .setDescription(
                    `Thank you for trading with **ICN**! 🎉\n\n` +
                    `The trade of **${dealRecord.usdtAmount} USDT** has been marked as complete and logged.\n` +
                    `Please click the button below to **Submit Vouch / Feedback** about your experience.`
                )
                .setColor('#2ECC71')
                .setTimestamp();

            const ticketComponents = new ActionRowBuilder();
            ticketComponents.addComponents(
                new ButtonBuilder()
                    .setCustomId(`p2p_vouch_btn:${dealRecord.dealId}`)
                    .setLabel('⭐ Submit Vouch / Feedback')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({
                embeds: [successEmbedObj],
                components: [ticketComponents]
            }).catch(() => null);
        }

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Transaction Proof Published!',
                    `The permanent transaction proof embed has been posted in <#${targetChannel.id}>.`
                )
            ]
        });
    } else {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [dealEmbed],
            components: [componentsRow]
        });
    }
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
                    `• **Total USDT Volume:** \`${stats.totalUsdtVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT\`\n` +
                    `• **Last Trade:** ${stats.lastDealTimestamp ? `<t:${Math.floor(new Date(stats.lastDealTimestamp).getTime() / 1000)}:R>` : 'Never'}`
                )
            ]
        });
    } else {
        const guildStats = await getGuildP2PStats(interaction.guildId);
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    `Server P2P Statistics`,
                    `• **Total Completed Deals:** \`${guildStats.completedDeals}\` deals\n` +
                    `• **Total P2P Volume Processed:** \`${guildStats.totalUsdtVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT\`\n\n` +
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
    const rawDeals = await getFromDb(dealsKey, []);
    let deals = Array.isArray(rawDeals) ? rawDeals : [];

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

/**
 * Resets P2P limits and active bans for a specific user.
 */
async function handleReset(interaction) {
    const config = await getP2PConfig(interaction.guildId);

    // Permission check: Only staff or admins can reset P2P limits
    const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
    const hasStaffRole = config.staffRoleId && interaction.member
        ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(config.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.staffRoleId))
        : false;

    if (!hasManageGuild && !hasStaffRole) {
        const requiredMsg = config.staffRoleId
            ? `You need the <@&${config.staffRoleId}> role or \`Manage Server\` permission to reset P2P limits.`
            : 'You need the `Manage Server` permission to reset P2P limits.';
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: requiredMsg });
    }

    const targetUser = interaction.options.getUser('user');
    const today = new Date().toISOString().split('T')[0];

    const dailyTicketsKey = `guild:${interaction.guildId}:p2p:daily_tickets:${targetUser.id}:${today}`;
    const timepassKey = `guild:${interaction.guildId}:p2p:timepass_count:${targetUser.id}`;
    const banKey = `guild:${interaction.guildId}:p2p:ban_until:${targetUser.id}`;

    await deleteFromDb(dailyTicketsKey).catch(() => null);
    await deleteFromDb(timepassKey).catch(() => null);
    await deleteFromDb(banKey).catch(() => null);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'P2P Limits Reset',
                `Successfully cleared P2P limits and restrictions for ${targetUser}.\n\n` +
                `• **Daily Tickets Count:** Reset to \`0\`\n` +
                `• **Timepass Count:** Reset to \`0\`\n` +
                `• **P2P Ban Status:** Lifted (if active)`
            )
        ]
    });
}
