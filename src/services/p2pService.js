import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getFromDb, setInDb, getP2PConfigKey, getP2PDealsKey, getP2PDealKey, getP2PUserStatsKey, getTicketData, saveTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export const DEFAULT_P2P_CONFIG = {
    dealChannelId: null,
    vouchChannelId: null,
    staffRoleId: null,
    priceChannelId: null,
    titleText: 'Successful Transaction',
    footerText: 'ICN Verified Successful Deal',
    embedColor: '#FFC107', // Amber/Yellow matching reference design
    minTradeAmount: 50,
};

export const DEFAULT_PAYMENT_CONFIG = {
    upiId: 'icn@upi',
    upiQrUrl: null,
    impsAccount: '998877665544',
    impsIfsc: 'SBIN0001234',
    impsName: 'ICN P2P Exchange',
    cdmAccount: '998877665544 (State Bank of India)',
    trc20Wallet: 'T9xICNUSDTTRC20OfficialWalletAddress',
    erc20Wallet: '0x71C569ICNUSDTERC20OfficialWalletAddress',
    bep20Wallet: '0x71C569ICNUSDTBEP20OfficialWalletAddress',
};

/**
 * Retrieves the P2P configuration for a guild.
 */
export async function getP2PConfig(guildId) {
    if (!guildId) return { ...DEFAULT_P2P_CONFIG };
    const key = getP2PConfigKey(guildId);
    const data = await getFromDb(key, {});
    return { ...DEFAULT_P2P_CONFIG, ...data };
}

/**
 * Saves or updates P2P configuration for a guild.
 */
export async function saveP2PConfig(guildId, newConfig) {
    if (!guildId) return;
    const current = await getP2PConfig(guildId);
    const updated = { ...current, ...newConfig };
    const key = getP2PConfigKey(guildId);
    await setInDb(key, updated);
    return updated;
}

/**
 * Retrieves payment configuration for a guild.
 */
export async function getP2PPaymentConfig(guildId) {
    if (!guildId) return { ...DEFAULT_PAYMENT_CONFIG };
    const key = `guild:${guildId}:p2p:payments`;
    const data = await getFromDb(key, {});
    return { ...DEFAULT_PAYMENT_CONFIG, ...data };
}

/**
 * Saves payment configuration for a guild.
 */
export async function saveP2PPaymentConfig(guildId, newPayments) {
    if (!guildId) return;
    const current = await getP2PPaymentConfig(guildId);
    const updated = { ...current, ...newPayments };
    const key = `guild:${guildId}:p2p:payments`;
    await setInDb(key, updated);
    return updated;
}

/**
 * Format currency string nicely with comma separators.
 */
function formatCurrency(amount, symbol = '$', label = 'USD') {
    const num = parseFloat(amount);
    if (isNaN(num)) return `${amount} ${label}`;
    const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted} ${label}`;
}

/**
 * Formats a transaction hash string into short truncated code or link format.
 */
function formatTxHash(txHash) {
    if (!txHash) return '`N/A`';
    if (txHash.startsWith('http://') || txHash.startsWith('https://')) {
        return `[View Transaction](${txHash})`;
    }
    if (txHash.length > 24) {
        return `\`${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}\``;
    }
    return `\`${txHash}\``;
}

/**
 * Builds payment instruction embed for BUY tickets based on payment method selected.
 */
export function buildBuyPaymentEmbed(paymentMethod, config = DEFAULT_PAYMENT_CONFIG, totalInr = null, receiveUsdt = null) {
    const method = (paymentMethod || '').toUpperCase();
    const embed = new EmbedBuilder().setColor('#2ECC71');

    const amountLine = totalInr ? `💵 **Amount to Pay:** \`₹${totalInr.toFixed(2)} INR\`\n` : '';
    const receiveLine = receiveUsdt ? `🪙 **Net USDT You Receive:** \`${receiveUsdt.toFixed(2)} USDT\`\n\n` : (totalInr ? '\n' : '');
    const headerLine = amountLine + receiveLine;

    if (method === 'UPI') {
        embed.setTitle('💳 Official UPI Payment Details')
            .setDescription(
                headerLine +
                `Please pay the exact amount using the UPI details below:\n\n` +
                `> **UPI ID:** \`${config.upiId}\`\n\n` +
                `📸 **Instruction:** Once payment is complete, please upload your **Payment Screenshot** in this ticket channel.`
            );
        if (config.upiQrUrl) {
            embed.setImage(config.upiQrUrl);
        }
    } else if (method === 'IMPS') {
        embed.setTitle('🏦 Official IMPS Bank Transfer Details')
            .setDescription(
                headerLine +
                `Please transfer the exact amount via IMPS using the bank details below:\n\n` +
                `> **Account Number:** \`${config.impsAccount}\`\n` +
                `> **IFSC Code:** \`${config.impsIfsc}\`\n` +
                `> **Account Name:** \`${config.impsName}\`\n\n` +
                `📸 **Instruction:** Once IMPS transfer is complete, please upload your **Payment Screenshot** in this ticket channel.`
            );
    } else if (method === 'CDM') {
        embed.setTitle('🏧 Official CDM Cash Deposit Details')
            .setDescription(
                headerLine +
                `Please deposit cash via CDM using the account details below:\n\n` +
                `> **CDM Account:** \`${config.cdmAccount}\`\n\n` +
                `📸 **Instruction:** Once cash deposit is complete, please upload your **CDM Deposit Receipt Screenshot** in this ticket channel.`
            );
    } else {
        embed.setTitle('💳 Official CCW Deposit Instructions')
            .setDescription(
                `CCW Payment Method selected.\n\n` +
                `A verified Middleman / Support staff will provide custom CCW payment instructions in this ticket shortly.`
            );
    }

    embed.setFooter({ text: 'ICN Payment Security • Verify details before sending' });
    return embed;
}

/**
 * Builds deposit wallet instruction embed for SELL tickets based on network selected.
 */
export function buildSellPaymentEmbed(network, config = DEFAULT_PAYMENT_CONFIG, amountVal = null, totalInrPayout = null) {
    const net = (network || '').toUpperCase();
    const embed = new EmbedBuilder().setColor('#E74C3C');

    let walletAddress = config.trc20Wallet;
    let label = 'USDT (TRC20)';

    if (net.includes('USDT') && net.includes('ERC20')) {
        walletAddress = config.erc20Wallet;
        label = 'USDT (ERC20)';
    } else if (net.includes('USDT') && net.includes('BEP20')) {
        walletAddress = config.bep20Wallet;
        label = 'USDT (BEP20)';
    }

    const amountLine = amountVal ? `🪙 **USDT to Deposit:** \`${amountVal.toFixed(2)} USDT\`\n` : '';
    const payoutLine = totalInrPayout ? `💵 **Expected Payout:** \`₹${totalInrPayout.toFixed(2)} INR\`\n\n` : '\n';

    embed.setTitle(`📥 Official Deposit Wallet for ${label}`)
        .setDescription(
            amountLine +
            payoutLine +
            `Please transfer your crypto to the official deposit wallet address below:\n\n` +
            `> **Network:** \`${label}\`\n` +
            `> **Deposit Address:** \`${walletAddress}\`\n\n` +
            `📸 **Instruction:** Once sent, please upload your **Transaction Screenshot / Tx Hash link** in this ticket channel.`
        )
        .setFooter({ text: 'ICN Wallet Security • Ensure network matches before sending' });

    return embed;
}

/**
 * Automatically detects `#looking-to-buy` and `#looking-to-sell` channels in a guild
 * and deploys/maintains the Buy (with/without KYC) and Sell (with/without KYC) ticket panels automatically.
 */
export async function autoDeployP2PPanels(guild) {
    if (!guild || !guild.channels) return;

    try {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) return;

        const buyChannel = channels.find(c => c && c.isTextBased() && (
            c.name.includes('looking-to-buy') || c.name.includes('buy-usdt') || c.name === 'buy'
        ));

        const sellChannel = channels.find(c => c && c.isTextBased() && (
            c.name.includes('looking-to-sell') || c.name.includes('sell-usdt') || c.name === 'sell'
        ));

        if (buyChannel) {
            const msgs = await buyChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botHasNewPanel = msgs && msgs.some(m => m.author.id === guild.client.user.id && m.components.some(row => row.components.some(b => b.customId === 'p2p_trade_buy_kyc')) && m.embeds.some(e => e.description?.includes('$50 - $499') && e.description?.includes('Tiered fees')));
            
            if (!botHasNewPanel) {
                if (msgs) {
                    const oldPanels = msgs.filter(m => m.author.id === guild.client.user.id);
                    for (const m of oldPanels.values()) {
                        await m.delete().catch(() => null);
                    }
                }

                const buyEmbed = new EmbedBuilder()
                    .setTitle('🟢 Buy USDT - P2P Portal')
                    .setDescription(
                        `Welcome to **${guild.name}** USDT Buying Portal!\n\n` +
                        `Select an option below to open an instant 1-on-1 Middleman Buy Ticket:\n\n` +
                        `• **🟢 Buy with KYC:** Tiered fees apply:\n` +
                        `  - **$50 - $499:** **$2** flat fee\n` +
                        `  - **$500 - $10000:** **0.5%** fee of amount\n` +
                        `• **🟢 Buy without KYC:** Tiered fees apply:\n` +
                        `  - **$50 - $100:** **$2** flat fee\n` +
                        `  - **$101 - $500:** **$3** flat fee\n` +
                        `  - **$501 - $1200:** **$5** flat fee\n` +
                        `  - **$1200 - $10000:** **0.5%** fee of amount\n\n` +
                        `*🛡️ All trades are 100% protected by ICN Auto-MM Security.*`
                    )
                    .setColor('#2ECC71')
                    .setFooter({ text: `${guild.name} • Official P2P Buy Portal` });

                const buyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('p2p_trade_buy_kyc')
                        .setLabel('🟢 Buy with KYC')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('p2p_trade_buy_nokyc')
                        .setLabel('🟢 Buy without KYC')
                        .setStyle(ButtonStyle.Primary)
                );

                await buyChannel.send({ embeds: [buyEmbed], components: [buyRow] }).catch(() => null);
            }
        }

        if (sellChannel) {
            const msgs = await sellChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botHasNewPanel = msgs && msgs.some(m => m.author.id === guild.client.user.id && m.components.some(row => row.components.some(b => b.customId === 'p2p_trade_sell_kyc')) && m.embeds.some(e => e.description?.includes('₹250') && e.description?.includes('₹100')));

            if (!botHasNewPanel) {
                if (msgs) {
                    const oldPanels = msgs.filter(m => m.author.id === guild.client.user.id);
                    for (const m of oldPanels.values()) {
                        await m.delete().catch(() => null);
                    }
                }

                const sellEmbed = new EmbedBuilder()
                    .setTitle('🔴 Sell USDT - P2P Portal')
                    .setDescription(
                        `Welcome to **${guild.name}** USDT Selling Portal!\n\n` +
                        `Select an option below to open an instant 1-on-1 Middleman Sell Ticket:\n\n` +
                        `• **🔴 Sell with KYC:** Full rate payout (Flat **₹100** network fee deducted from payout).\n` +
                        `• **🔴 Sell without KYC:** Full rate payout (Flat **₹250** fee deducted from payout).\n\n` +
                        `*🛡️ All trades are 100% protected by ICN Auto-MM Security.*`
                    )
                    .setColor('#E74C3C')
                    .setFooter({ text: `${guild.name} • Official P2P Sell Portal` });

                const sellRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('p2p_trade_sell_kyc')
                        .setLabel('🔴 Sell with KYC')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('p2p_trade_sell_nokyc')
                        .setLabel('🔴 Sell without KYC')
                        .setStyle(ButtonStyle.Primary)
                );

                await sellChannel.send({ embeds: [sellEmbed], components: [sellRow] }).catch(() => null);
            }
        }

        // Combined live price/portal channel auto-deployer
        const config = await getP2PConfig(guild.id).catch(() => null);
        const priceChannel = channels.find(c => c && c.isTextBased() && (
            (config && c.id === config.priceChannelId) || c.name.includes('usdt-price') || c.name === 'price'
        ));

        if (priceChannel) {
            const msgs = await priceChannel.messages.fetch({ limit: 10 }).catch(() => null);
            
            // Check if there is already a portal or price update panel deployed by ICN
            const botHasNewPanel = msgs && msgs.some(m => 
                m.author.id === guild.client.user.id && 
                m.embeds.some(e => e.title && (e.title.includes('P2P Portal') || e.title.includes('Market Price Update')))
            );

            if (!botHasNewPanel) {

                const portalEmbed = new EmbedBuilder()
                    .setTitle('⚡ USDT P2P Portal')
                    .setDescription(
                        `Welcome to **${guild.name}** P2P Trading Hub!\n\n` +
                        `🟢 **Buy USDT**    |    🔴 **Sell USDT**`
                    )
                    .setColor('#FFC107')
                    .setFooter({ text: `${guild.name} • Official P2P Hub` });

                const p2pChannels = resolveP2PChannels(guild);
                const portalRow = buildPriceComponents(
                    config?.vouchChannelId, 
                    guild.id, 
                    p2pChannels.buyChannelId, 
                    p2pChannels.sellChannelId
                );

                await priceChannel.send({ embeds: [portalEmbed], components: [portalRow] }).catch(() => null);
            }
        }

    } catch (err) {
        logger.error('Error in autoDeployP2PPanels:', err.message);
    }
}

/**
 * Automatically scans a ticket channel to detect Buyer, Seller, Amount, Tx Hash, and Deal Info.
 */
export async function autoDetectDealFromChannel(channel, guildId) {
    let buyerId = null;
    let sellerId = null;
    let usdtAmount = null;
    let txHash = null;
    let dealInfo = null;
    let isSell = false;
    let userCreatorId = null;

    try {
        const ticketData = await getTicketData(guildId, channel.id).catch(() => null);
        if (ticketData) {
            userCreatorId = ticketData.userId;
            const reason = ticketData.reason || '';
            isSell = reason.toLowerCase().includes('sell');
            
            // Extract exact amount from ticket reason
            const amountMatch = reason.match(/(Buy|Sell)\s+(\d+(\.\d+)?)\s+USDT/i);
            if (amountMatch) {
                usdtAmount = parseFloat(amountMatch[2]);
            }
        }

        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);

        if (messages && messages.size > 0) {
            const msgArray = Array.from(messages.values()).reverse();

            const humanMentionIds = new Set();
            for (const msg of msgArray) {
                if (!msg.author.bot) {
                    humanMentionIds.add(msg.author.id);
                }
                msg.mentions.users.forEach(u => {
                    if (!u.bot) humanMentionIds.add(u.id);
                });
            }

            const humanList = Array.from(humanMentionIds);
            if (!userCreatorId && humanList.length > 0) {
                userCreatorId = humanList[0];
            }

            const txRegex = /(0x[a-fA-F0-9]{40,66})|(https?:\/\/(bscscan|etherscan|tronscan|solscan)[^\s]+)/i;
            const amountRegex = /(\b\d+(\.\d+)?\b)\s*(usdt|usd|\$)/i;
            const altAmountRegex = /(amount|total|price|paid|sent)[:\s]*\$?(\d+(\.\d+)?)/i;

            for (const msg of msgArray) {
                if (msg.author.bot) continue;

                const text = msg.content || '';

                if (!txHash) {
                    const txMatch = text.match(txRegex);
                    if (txMatch) {
                        txHash = txMatch[1] || txMatch[2];
                    }
                }

                if (!usdtAmount) {
                    const amtMatch = text.match(amountRegex) || text.match(altAmountRegex);
                    if (amtMatch) {
                        const parsed = parseFloat(amtMatch[1] || amtMatch[2]);
                        if (!isNaN(parsed) && parsed > 0) {
                            usdtAmount = parsed;
                        }
                    }
                }

                if (!dealInfo && (text.toLowerCase().includes('wallet') || text.toLowerCase().includes('inr') || text.toLowerCase().includes('binance') || text.toLowerCase().includes('p2p') || text.toLowerCase().includes('bank'))) {
                    dealInfo = text.substring(0, 80).replace(/\n/g, ' ');
                }
            }
        }
    } catch (err) {
        logger.error('Error auto-detecting deal info from channel:', { error: err.message, channelId: channel.id });
    }

    const botId = channel.client.user.id;
    buyerId = isSell ? botId : userCreatorId;
    sellerId = isSell ? userCreatorId : botId;

    const config = await getP2PConfig(channel.guild?.id).catch(() => null);
    const minLimit = config?.minTradeAmount !== undefined ? config.minTradeAmount : 50;

    return {
        buyerId,
        sellerId,
        usdtAmount: usdtAmount || minLimit,
        usdAmount: usdtAmount || minLimit,
        txHash: txHash || null,
        dealInfo: dealInfo || (isSell ? 'Sell USDT Deal' : 'Buy USDT Deal')
    };
}

/**
 * Automatically scans a ticket channel, logs the deal, and posts the permanent embed.
 */
export async function autoDetectAndPublishDeal(channel, guildId, executorId = null) {
    // Prevent duplicate logs using client memory
    if (!channel.client.loggedDeals) {
        channel.client.loggedDeals = new Set();
    }
    if (channel.client.loggedDeals.has(channel.id)) {
        return null;
    }
    channel.client.loggedDeals.add(channel.id);

    const config = await getP2PConfig(guildId);
    
    const detected = await autoDetectDealFromChannel(channel, guildId);
    
    let targetChannel = null;
    if (config.dealChannelId) {
        targetChannel = channel.guild.channels.cache.get(config.dealChannelId) || 
                        await channel.guild.channels.fetch(config.dealChannelId).catch(() => null);
    }
    if (!targetChannel) {
        const guildChannels = await channel.guild.channels.fetch().catch(() => null) || channel.guild.channels.cache;
        if (guildChannels) {
            // Priority 1: Exact match for completed-transactions
            targetChannel = guildChannels.find(c => 
                c && c.type === ChannelType.GuildText && 
                c.name.toLowerCase() === 'completed-transactions'
            );
            
            // Priority 2: Contains completed-transactions
            if (!targetChannel) {
                targetChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    c.name.toLowerCase().includes('completed-transactions')
                );
            }

            // Priority 3: Contains completed/deals/transac, but not current channel, and not a ticket channel
            if (!targetChannel) {
                targetChannel = guildChannels.find(c =>
                    c && c.type === ChannelType.GuildText &&
                    c.id !== channel.id &&
                    !c.name.toLowerCase().includes('ticket') &&
                    !c.name.toLowerCase().startsWith('buy-') &&
                    !c.name.toLowerCase().startsWith('sell-') &&
                    (c.name.toLowerCase().includes('deal') || 
                     c.name.toLowerCase().includes('transac') || 
                     c.name.toLowerCase().includes('completed'))
                );
            }
        }
    }
    if (!targetChannel) {
        targetChannel = channel;
    }

    const botId = channel.client.user.id;
    const buyerId = detected.buyerId;
    const sellerId = detected.sellerId;
    const dealRecord = await logDeal(guildId, {
        buyerId,
        sellerId,
        usdtAmount: detected.usdtAmount,
        usdAmount: detected.usdAmount,
        txHash: detected.txHash,
        dealInfo: detected.dealInfo,
        status: 'Completed',
        loggedBy: executorId || (buyerId === botId ? sellerId : buyerId)
    }, botId);

    const dealEmbed = buildDealEmbed(dealRecord, config, null, channel.guild);

    const sentMsg = await targetChannel.send({
        embeds: [dealEmbed]
    });

    dealRecord.messageId = sentMsg.id;
    dealRecord.channelId = targetChannel.id;

    // Mark ticket as completed in database
    if (channel) {
        const ticketData = await getTicketData(guildId, channel.id).catch(() => null);
        if (ticketData) {
            ticketData.dealCompleted = true;
            await saveTicketData(guildId, channel.id, ticketData).catch(() => null);
        }
    }

    // Call helper to send vouch/snap redirect messages and schedule 30-min auto-close
    if (channel && channel.id !== targetChannel.id) {
        await sendVouchMessagesAndScheduleClose(channel, dealRecord).catch(() => null);
    }

    // Post to transaction-details if it exists
    await sendTransactionDetailsLog(channel.guild, dealRecord).catch(() => null);

    return dealRecord;
}

/**
 * Sends transaction complete feedback/vouch messages and schedules auto-closing of the ticket channel after 30 minutes.
 */
export async function sendVouchMessagesAndScheduleClose(channel, dealRecord) {
    if (!channel || !dealRecord) return;

    // Check if this is actually a ticket channel before sending vouch messages and closing
    const name = channel.name?.toLowerCase() || '';
    const isTicket = name.includes('ticket') || name.startsWith('buy-') || name.startsWith('sell-') || name.startsWith('p2p-');
    if (!isTicket) return;

    // Message 1: Vouch/Feedback request
    const guildChannels = await channel.guild.channels.fetch().catch(() => null) || channel.guild.channels.cache;
    const snapsChannel = guildChannels.find(c => 
        c && c.type === ChannelType.GuildText && 
        (c.name.toLowerCase().includes('snap') || c.name.toLowerCase().includes('screenshot'))
    );

    // Resolve the human user (ticket creator)
    const botId = channel.client.user.id;
    const humanUserId = (dealRecord.buyerId === 'server' || dealRecord.buyerId === botId) ? dealRecord.sellerId : dealRecord.buyerId;

    const successEmbedObj = new EmbedBuilder()
        .setTitle('🎉 Transaction Complete')
        .setDescription(
            `Thank you for trading with **ICN**! 🎉\n\n` +
            `The trade of **${dealRecord.usdtAmount} USDT** has been marked as complete and logged.\n\n` +
            `• **⭐ Submit Vouch:** Please click below to submit feedback about your experience.\n` +
            `• **📸 Share Snaps:** Please click below to upload your payment screenshot/receipt in the ${snapsChannel ? `<#${snapsChannel.id}>` : '#transaction-snaps'} channel.\n\n` +
            `🕒 **Notice:** This ticket will be automatically closed in **30 minutes**. Please copy any details you need.`
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

    if (snapsChannel) {
        ticketComponents.addComponents(
            new ButtonBuilder()
                .setLabel('📸 Go to #transaction-snaps')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${channel.guild.id}/${snapsChannel.id}`)
        );
    } else {
        ticketComponents.addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_snaps_not_found')
                .setLabel('📸 Share Screenshots')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    await channel.send({
        embeds: [successEmbedObj],
        components: [ticketComponents]
    }).catch(() => null);

    // Ping the user so they are aware the ticket will close in 30 minutes
    await channel.send({
        content: `🔔 <@${humanUserId}>, transaction complete! This ticket will automatically close in **30 minutes**.`
    }).catch(() => null);

    // Schedule auto-close in 30 minutes (1800000 ms)
    setTimeout(async () => {
        try {
            const freshChannel = channel.guild.channels.cache.get(channel.id) || 
                                 await channel.guild.channels.fetch(channel.id).catch(() => null);
            if (!freshChannel) return;

            const { closeTicket } = await import('./ticket.js');
            await closeTicket(freshChannel, channel.client.user, 'Auto-logged P2P Deal complete.');

            const { cleanP2PPortalChannels } = await import('./p2pService.js');
            await cleanP2PPortalChannels(channel.guild).catch(() => null);
        } catch (closeErr) {
            logger.error('Failed to auto-close ticket after 30 minutes:', closeErr);
        }
    }, 30 * 60 * 1000);
}

/**
 * Builds the P2P Deal Log Embed matching reference design.
 */
export function buildDealEmbed(deal, config = DEFAULT_P2P_CONFIG, formattedDate = null, guild = null, revealUsers = false) {
    const title = config.titleText || 'Successful Transaction';
    const embedColor = config.embedColor || '#FFC107';

    const numUsdt = parseFloat(deal.usdtAmount) || 0;
    const usdVal = deal.usdAmount ? formatCurrency(deal.usdAmount, '$', 'USD') : formatCurrency(numUsdt, '$', 'USD');
    const usdtVal = `${numUsdt} USDT`;

    const txFormatted = formatTxHash(deal.txHash);
    const dealInfoText = deal.dealInfo || 'P2P USDT Transfer';
    const statusText = deal.status || 'Completed';

    const botId = guild?.client?.user?.id;

    // Show bot as mention (e.g. @USDT MarketPlace) and human trader as raw ID in code block or mention
    const botLabel = '@USDT MarketPlace';
    const buyerMention = (deal.buyerId === 'server' || deal.buyerId === botId) 
        ? botLabel 
        : (revealUsers ? `<@${deal.buyerId}>` : `\`${deal.buyerId}\``);
    const sellerMention = (deal.sellerId === 'server' || deal.sellerId === botId) 
        ? botLabel 
        : (revealUsers ? `<@${deal.sellerId}>` : `\`${deal.sellerId}\``);

    const description = [
        `> **Between:** ${buyerMention} and ${sellerMention}`,
        `> **Amount:** ≈ ${usdVal} / ${usdtVal}`,
        `> **Deal Info:** ${dealInfoText}`,
        `> **Status:** \`${statusText}\``
    ].join('\n');

    const now = new Date();
    const timestampText = now.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Resolve footer text from config, ensure "Vanta" is replaced with "ICN"
    let footerBase = config.footerText || 'ICN Verified Successful Deal';
    footerBase = footerBase.replace(/Vanta/ig, 'ICN');

    const finalFooterText = `${footerBase} | ${timestampText}`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(embedColor)
        .setFooter({ text: finalFooterText });

    return embed;
}

/**
 * Builds the button components for the deal announcement.
 */
export function buildDealComponents(vouchChannelId, dealId) {
    const row = new ActionRowBuilder();

    const targetVouchLabel = vouchChannelId ? `Done reading? Check out #${vouchChannelId}` : 'Done reading? Check out #gws-vouches';
    
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`p2p_goto_vouch:${vouchChannelId || 'default'}`)
            .setLabel(targetVouchLabel)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📌')
    );

    return row;
}

/**
 * Helper to dynamically resolve P2P Buy and Sell channel IDs from a guild.
 */
export function resolveP2PChannels(guild) {
    if (!guild || !guild.channels) return { buyChannelId: null, sellChannelId: null };
    const channels = guild.channels.cache;
    const buyChannel = channels.find(c => c && c.isTextBased() && (
        c.name.includes('looking-to-buy') || c.name.includes('buy-usdt') || c.name === 'buy'
    ));
    const sellChannel = channels.find(c => c && c.isTextBased() && (
        c.name.includes('looking-to-sell') || c.name.includes('sell-usdt') || c.name === 'sell'
    ));
    return {
        buyChannelId: buyChannel ? buyChannel.id : null,
        sellChannelId: sellChannel ? sellChannel.id : null
    };
}

/**
 * Builds the Ultra-Professional USDT Market Price Update Embed matching reference design.
 */
export function buildPriceUpdateEmbed(priceData, guildName = 'ICN Network') {
    const symbol = priceData.symbol || '₹';
    const buyNum = parseFloat(priceData.buyPrice) || 0;
    const sellNum = parseFloat(priceData.sellPrice) || 0;

    const formattedBuy = `${symbol} ${buyNum.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
    const formattedSell = `${symbol} ${sellNum.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;

    const description = [
        `**${guildName}** has updated the real-time P2P exchange rates.`,
        `Select an option below to be redirected to the secure portal channels where you can request a Buy or Sell ticket.`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📈 USDT Market Price Update')
        .setDescription(description)
        .setColor('#FFC107')
        .addFields(
            { name: '🟢 Buy Price', value: `\`\`\`\n${formattedBuy}\n\`\`\``, inline: true },
            { name: '🔴 Sell Price', value: `\`\`\`\n${formattedSell}\n\`\`\``, inline: true }
        );

    const now = new Date();
    const timestampStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    embed.setFooter({ text: `${guildName} - Market Sync • Today at ${timestampStr}` });

    return embed;
}

/**
 * Builds the action row buttons for price updates, dynamically setting direct channel link redirect buttons.
 */
export function buildPriceComponents(vouchChannelId, guildId = null, buyChannelId = null, sellChannelId = null) {
    const row = new ActionRowBuilder();

    if (guildId && buyChannelId) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('🟢 Buy USDT')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${guildId}/${buyChannelId}`)
        );
    } else {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_price_buy')
                .setLabel('🟢 Buy USDT')
                .setStyle(ButtonStyle.Success)
        );
    }

    if (guildId && sellChannelId) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('🔴 Sell USDT')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${guildId}/${sellChannelId}`)
        );
    } else {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('p2p_price_sell')
                .setLabel('🔴 Sell USDT')
                .setStyle(ButtonStyle.Danger)
        );
    }

    return row;
}

export async function logDeal(guildId, dealData, botId = null) {
    const dealsKey = getP2PDealsKey(guildId);
    const rawDeals = await getFromDb(dealsKey, []);
    const deals = Array.isArray(rawDeals) ? rawDeals : [];

    const dealId = `DEAL-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    const record = {
        dealId,
        guildId,
        buyerId: dealData.buyerId,
        sellerId: dealData.sellerId,
        usdtAmount: dealData.usdtAmount,
        usdAmount: dealData.usdAmount || dealData.usdtAmount,
        txHash: dealData.txHash || null,
        dealInfo: dealData.dealInfo || 'P2P Deal',
        status: dealData.status || 'Completed',
        loggedBy: dealData.loggedBy,
        timestamp,
        messageId: null,
        channelId: null
    };

    deals.push(record);
    await setInDb(dealsKey, deals);

    const singleDealKey = getP2PDealKey(guildId, dealId);
    await setInDb(singleDealKey, record);

    await updateUserStats(guildId, dealData.buyerId, record, botId);
    await updateUserStats(guildId, dealData.sellerId, record, botId);

    return record;
}

/**
 * Updates P2P deal stats for a user.
 */
async function updateUserStats(guildId, userId, dealRecord, botId = null) {
    if (!userId || userId === 'server' || userId === botId) return;
    const userStatsKey = getP2PUserStatsKey(guildId, userId);
    const current = await getFromDb(userStatsKey, {
        totalDeals: 0,
        completedDeals: 0,
        totalUsdtVolume: 0,
        lastDealTimestamp: null
    });

    const isCompleted = dealRecord.status === 'Completed';
    const amountNum = parseFloat(dealRecord.usdtAmount) || 0;

    const updated = {
        totalDeals: (current.totalDeals || 0) + 1,
        completedDeals: isCompleted ? (current.completedDeals || 0) + 1 : (current.completedDeals || 0),
        totalUsdtVolume: (current.totalUsdtVolume || 0) + (isCompleted ? amountNum : 0),
        lastDealTimestamp: dealRecord.timestamp
    };

    await setInDb(userStatsKey, updated);
    return updated;
}

/**
 * Gets P2P stats for a user in a guild.
 */
export async function getUserP2PStats(guildId, userId) {
    const userStatsKey = getP2PUserStatsKey(guildId, userId);
    return await getFromDb(userStatsKey, {
        totalDeals: 0,
        completedDeals: 0,
        totalUsdtVolume: 0,
        lastDealTimestamp: null
    });
}

/**
 * Gets global guild P2P stats.
 */
export async function getGuildP2PStats(guildId) {
    const dealsKey = getP2PDealsKey(guildId);
    const rawDeals = await getFromDb(dealsKey, []);
    const deals = Array.isArray(rawDeals) ? rawDeals : [];
    
    const completed = deals.filter(d => d.status === 'Completed');
    const totalVolume = completed.reduce((acc, d) => acc + (parseFloat(d.usdtAmount) || 0), 0);

    return {
        totalDeals: deals.length,
        completedDeals: completed.length,
        totalUsdtVolume: totalVolume
    };
}

/**
 * Automatically cleans P2P portal/price channels by removing non-panel clutter messages.
 */
export async function cleanP2PPortalChannels(guild) {
    if (!guild || !guild.channels) return;
    try {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) return;

        const targetChannels = channels.filter(c => c && c.isTextBased() && (
            c.name.includes('looking-to-buy') || c.name.includes('buy-usdt') || c.name === 'buy' ||
            c.name.includes('looking-to-sell') || c.name.includes('sell-usdt') || c.name === 'sell' ||
            c.name.includes('usdt-price') || c.name === 'price'
        ));

        for (const channel of targetChannels.values()) {
            const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!msgs || msgs.size === 0) continue;
            const toDelete = [];
            for (const msg of msgs.values()) {
                // Skip if sender is an admin or has manage permissions
                const isAdmin = msg.member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                                msg.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                (msg.author && msg.author.id === guild.ownerId);
                if (isAdmin) continue;

                // Skip if it's the bot's own P2P portal or price update panel
                const isMainPanel = msg.author.id === guild.client.user.id && 
                                    msg.embeds.some(e => e.title && (
                                        e.title.includes('P2P Portal') || 
                                        e.title.includes('Market Price Update')
                                    ));

                if (!isMainPanel) {
                    toDelete.push(msg);
                }
            }

            if (toDelete.length > 0) {
                try {
                    await channel.bulkDelete(toDelete).catch(async () => {
                        for (const m of toDelete) {
                            await m.delete().catch(() => null);
                        }
                    });
                } catch (_) {
                    for (const m of toDelete) {
                        await m.delete().catch(() => null);
                    }
                }
            }
        }
    } catch (err) {
        logger.error('Error cleaning P2P portal channels:', err.message);
    }
}

/**
 * Resolves the latest buy and sell prices from configuration database or channel fallback.
 */
export async function resolveLatestPrices(guild) {
    const config = await getP2PConfig(guild.id).catch(() => null) || DEFAULT_P2P_CONFIG;
    
    let buyPrice = parseFloat(config.lastBuyPrice);
    let sellPrice = parseFloat(config.lastSellPrice);
    
    if (!isNaN(buyPrice) && !isNaN(sellPrice) && buyPrice > 0 && sellPrice > 0) {
        return { buyPrice, sellPrice };
    }
    
    try {
        const guildChannels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;
        const priceChannel = guildChannels.find(c =>
            c && c.isTextBased() &&
            (c.id === config.priceChannelId || c.name.toLowerCase().includes('usdt-price') || c.name.toLowerCase() === 'price')
        );
        
        if (priceChannel) {
            const messages = await priceChannel.messages.fetch({ limit: 20 }).catch(() => null);
            if (messages) {
                const priceMsg = messages.find(m => 
                    m.author.id === guild.client.user.id && 
                    m.embeds.some(e => e.title && e.title.includes('Market Price Update'))
                );
                
                if (priceMsg && priceMsg.embeds[0]) {
                    const fields = priceMsg.embeds[0].fields || [];
                    
                    let buyVal = null;
                    let sellVal = null;
                    
                    for (const field of fields) {
                        const name = field.name.toLowerCase();
                        if (name.includes('buy')) {
                            const match = field.value.replace(/```/g, '').match(/(\d+(\.\d+)?)/);
                            if (match) buyVal = parseFloat(match[1]);
                        } else if (name.includes('sell')) {
                            const match = field.value.replace(/```/g, '').match(/(\d+(\.\d+)?)/);
                            if (match) sellVal = parseFloat(match[1]);
                        }
                    }
                    
                    if (buyVal && sellVal) {
                        config.lastBuyPrice = buyVal;
                        config.lastSellPrice = sellVal;
                        await saveP2PConfig(guild.id, config).catch(() => null);
                        return { buyPrice: buyVal, sellPrice: sellVal };
                    }
                }
            }
        }
    } catch (err) {
        logger.error('Failed to resolve price from channel fallback:', err);
    }
    
    return { buyPrice: 105, sellPrice: 98 };
}

/**
 * Sends transaction complete detailed log messages with unmasked user mentions to the #transaction-details channel.
 */
export async function sendTransactionDetailsLog(guild, deal) {
    if (!guild || !deal) return;
    try {
        const guildChannels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;
        if (!guildChannels) return;

        const targetChannel = guildChannels.find(c => 
            c && c.type === ChannelType.GuildText && 
            (c.name.toLowerCase() === 'transaction-details' || 
             c.name.toLowerCase().includes('transaction-details'))
        );

        if (!targetChannel) {
            logger.warn(`[P2P] 'transaction-details' channel not found in guild ${guild.id}`);
            return;
        }

        const config = await getP2PConfig(guild.id).catch(() => null);
        const embed = buildDealEmbed(deal, config || DEFAULT_P2P_CONFIG, null, guild, true);

        await targetChannel.send({
            embeds: [embed]
        });
    } catch (err) {
        logger.error('[P2P] Failed to send transaction details log:', err);
    }
}

