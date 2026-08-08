import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFromDb, setInDb, getP2PConfigKey, getP2PDealsKey, getP2PDealKey, getP2PUserStatsKey, getTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export const DEFAULT_P2P_CONFIG = {
    dealChannelId: null,
    vouchChannelId: null,
    staffRoleId: null,
    priceChannelId: null,
    titleText: 'Successful Transaction',
    footerText: 'Vanta Verified Successful Deal',
    embedColor: '#FFC107', // Amber/Yellow matching reference design
};

export const DEFAULT_PAYMENT_CONFIG = {
    upiId: 'vanta@upi',
    upiQrUrl: null,
    impsAccount: '998877665544',
    impsIfsc: 'SBIN0001234',
    impsName: 'Vanta P2P Exchange',
    cdmAccount: '998877665544 (State Bank of India)',
    trc20Wallet: 'T9xVantaUSDTTRC20OfficialWalletAddress',
    erc20Wallet: '0x71C569VantaUSDTERC20OfficialWalletAddress',
    bep20Wallet: '0x71C569VantaUSDTBEP20OfficialWalletAddress',
    usdcTrc20Wallet: 'T9xVantaUSDCTRC20OfficialWalletAddress',
    usdcErc20Wallet: '0x71C569VantaUSDCERC20OfficialWalletAddress',
    usdcBep20Wallet: '0x71C569VantaUSDCBEP20OfficialWalletAddress',
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
export function buildBuyPaymentEmbed(paymentMethod, config = DEFAULT_PAYMENT_CONFIG) {
    const method = (paymentMethod || '').toUpperCase();
    const embed = new EmbedBuilder().setColor('#2ECC71');

    if (method === 'UPI') {
        embed.setTitle('💳 Official UPI Payment Details')
            .setDescription(
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
                `Please transfer the exact amount via IMPS using the bank details below:\n\n` +
                `> **Account Number:** \`${config.impsAccount}\`\n` +
                `> **IFSC Code:** \`${config.impsIfsc}\`\n` +
                `> **Account Name:** \`${config.impsName}\`\n\n` +
                `📸 **Instruction:** Once IMPS transfer is complete, please upload your **Payment Screenshot** in this ticket channel.`
            );
    } else if (method === 'CDM') {
        embed.setTitle('🏧 Official CDM Cash Deposit Details')
            .setDescription(
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

    embed.setFooter({ text: 'Vanta Payment Security • Verify details before sending' });
    return embed;
}

/**
 * Builds deposit wallet instruction embed for SELL tickets based on network selected.
 */
export function buildSellPaymentEmbed(network, config = DEFAULT_PAYMENT_CONFIG) {
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
    } else if (net.includes('USDC') && net.includes('TRC20')) {
        walletAddress = config.usdcTrc20Wallet;
        label = 'USDC (TRC20)';
    } else if (net.includes('USDC') && net.includes('ERC20')) {
        walletAddress = config.usdcErc20Wallet;
        label = 'USDC (ERC20)';
    } else if (net.includes('USDC') && net.includes('BEP20')) {
        walletAddress = config.usdcBep20Wallet;
        label = 'USDC (BEP20)';
    }

    embed.setTitle(`📥 Official Deposit Wallet for ${label}`)
        .setDescription(
            `Please transfer your crypto to the official deposit wallet address below:\n\n` +
            `> **Network:** \`${label}\`\n` +
            `> **Deposit Address:** \`${walletAddress}\`\n\n` +
            `📸 **Instruction:** Once sent, please upload your **Transaction Screenshot / Tx Hash link** in this ticket channel.`
        )
        .setFooter({ text: 'Vanta Wallet Security • Ensure network matches before sending' });

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
            const botHasNewPanel = msgs && msgs.some(m => m.author.id === guild.client.user.id && m.components.some(row => row.components.some(b => b.customId === 'p2p_trade_buy_kyc')) && m.embeds.some(e => e.description?.includes('Buy with KYC')));
            
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
                        `• **🟢 Buy with KYC:** KYC Verified trade with higher limits.\n` +
                        `• **🟢 Buy without KYC:** Instant Non-KYC quick trade.\n\n` +
                        `*🛡️ All trades are 100% protected by Vanta Auto-MM Security.*`
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
            const botHasNewPanel = msgs && msgs.some(m => m.author.id === guild.client.user.id && m.components.some(row => row.components.some(b => b.customId === 'p2p_trade_sell_kyc')) && m.embeds.some(e => e.description?.includes('Sell with KYC')));

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
                        `• **🔴 Sell with KYC:** Fast payout for KYC Verified sellers.\n` +
                        `• **🔴 Sell without KYC:** Instant Non-KYC sell trade.\n\n` +
                        `*🛡️ All trades are 100% protected by Vanta Auto-MM Security.*`
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
                        .setStyle(ButtonStyle.Secondary)
                );

                await sellChannel.send({ embeds: [sellEmbed], components: [sellRow] }).catch(() => null);
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

    try {
        const ticketData = await getTicketData(guildId, channel.id);
        if (ticketData?.userId) {
            buyerId = ticketData.userId;
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
            if (!buyerId && humanList.length > 0) {
                buyerId = humanList[0];
            }
            if (humanList.length > 1) {
                sellerId = humanList.find(id => id !== buyerId) || humanList[1];
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

    return {
        buyerId,
        sellerId,
        usdtAmount: usdtAmount || 100,
        usdAmount: usdtAmount || 100,
        txHash: txHash || null,
        dealInfo: dealInfo || 'P2P USDT Deal'
    };
}

/**
 * Automatically scans a ticket channel, logs the deal, and posts the permanent embed.
 */
export async function autoDetectAndPublishDeal(channel, guildId, executorId = null) {
    const config = await getP2PConfig(guildId);
    
    const detected = await autoDetectDealFromChannel(channel, guildId);
    
    const targetChannel = config.dealChannelId 
        ? channel.guild.channels.cache.get(config.dealChannelId) 
        : channel;

    if (!targetChannel) return null;

    const buyerId = detected.buyerId || executorId || channel.client?.user?.id;
    const sellerId = detected.sellerId || executorId || channel.client?.user?.id;

    const dealRecord = await logDeal(guildId, {
        buyerId,
        sellerId,
        usdtAmount: detected.usdtAmount,
        usdAmount: detected.usdAmount,
        txHash: detected.txHash,
        dealInfo: detected.dealInfo,
        status: 'Completed',
        loggedBy: executorId || buyerId
    });

    const dealEmbed = buildDealEmbed(dealRecord, config);
    const componentsRow = buildDealComponents(config.vouchChannelId, dealRecord.dealId);

    const sentMsg = await targetChannel.send({
        embeds: [dealEmbed],
        components: [componentsRow]
    });

    dealRecord.messageId = sentMsg.id;
    dealRecord.channelId = targetChannel.id;

    return dealRecord;
}

/**
 * Builds the P2P Deal Log Embed matching reference design.
 */
export function buildDealEmbed(deal, config = DEFAULT_P2P_CONFIG, formattedDate = null) {
    const title = config.titleText || 'Successful Transaction';
    const embedColor = config.embedColor || '#FFC107';

    const numUsdt = parseFloat(deal.usdtAmount) || 0;
    const usdVal = deal.usdAmount ? formatCurrency(deal.usdAmount, '$', 'USD') : formatCurrency(numUsdt, '$', 'USD');
    const usdtVal = `${numUsdt} USDT`;

    const txFormatted = formatTxHash(deal.txHash);
    const dealInfoText = deal.dealInfo || 'P2P USDT Transfer';
    const statusText = deal.status || 'Completed';

    const description = [
        `> **Between:** <@${deal.buyerId}> and <@${deal.sellerId}>`,
        `> **Amount:** ≈ ${usdVal} / ${usdtVal}`,
        `> **Tx:** ${txFormatted}`,
        `> **Deal Info:** ${dealInfoText}`,
        `> **Status:** \`${statusText}\``
    ].join('\n');

    const now = new Date();
    const timestampText = formattedDate || now.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const footerText = `${config.footerText || 'Vanta Verified Successful Deal'} | ${timestampText}`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(embedColor)
        .setFooter({ text: footerText });

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

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`p2p_vouch_btn:${dealId}`)
            .setLabel('⭐ Submit Vouch / Feedback')
            .setStyle(ButtonStyle.Primary)
    );

    return row;
}

/**
 * Builds the Ultra-Professional USDT Market Price Update Embed matching reference design.
 */
export function buildPriceUpdateEmbed(priceData, guildName = 'Vanta Network') {
    const symbol = priceData.symbol || '₹';
    const buyNum = parseFloat(priceData.buyPrice) || 0;
    const sellNum = parseFloat(priceData.sellPrice) || 0;

    const formattedBuy = `${symbol} ${buyNum.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
    const formattedSell = `${symbol} ${sellNum.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
    
    const spread = (buyNum - sellNum).toFixed(2);

    const description = [
        `**${guildName}** has updated the real-time P2P exchange rates.\n`,
        `> **🟢 BUY PRICE** \`\`\`${formattedBuy}\`\`\``,
        `> **🔴 SELL PRICE** \`\`\`${formattedSell}\`\`\``
    ].join('\n');

    const paymentMethods = priceData.paymentMethods || 'UPI • IMPS • Paytm • GPay • Bank Transfer';

    const embed = new EmbedBuilder()
        .setTitle('📈 USDT Market Price Update')
        .setDescription(description)
        .setColor('#FFC107')
        .addFields(
            { name: '💳 Payment Methods', value: `\`${paymentMethods}\``, inline: true },
            { name: '📊 Market Spread', value: `\`${symbol} ${spread}\``, inline: true }
        );

    const now = new Date();
    const timestampStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    embed.setFooter({ text: `${guildName} - Market Sync • Today at ${timestampStr}` });

    return embed;
}

/**
 * Builds the action row buttons for price updates.
 */
export function buildPriceComponents(vouchChannelId) {
    const row = new ActionRowBuilder();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId('p2p_price_buy')
            .setLabel('🟢 Buy USDT')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('p2p_price_sell')
            .setLabel('🔴 Sell USDT')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`p2p_goto_vouch:${vouchChannelId || 'default'}`)
            .setLabel('⭐ View Vouches')
            .setStyle(ButtonStyle.Secondary)
    );

    return row;
}

/**
 * Logs a new P2P deal in database and updates stats.
 */
export async function logDeal(guildId, dealData) {
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

    await updateUserStats(guildId, dealData.buyerId, record);
    await updateUserStats(guildId, dealData.sellerId, record);

    return record;
}

/**
 * Updates P2P deal stats for a user.
 */
async function updateUserStats(guildId, userId, dealRecord) {
    if (!userId) return;
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
