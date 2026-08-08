import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFromDb, setInDb, getP2PConfigKey, getP2PDealsKey, getP2PDealKey, getP2PUserStatsKey, getTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export const DEFAULT_P2P_CONFIG = {
    dealChannelId: null,
    vouchChannelId: null,
    staffRoleId: null,
    titleText: 'Successful Transaction',
    footerText: 'Auto-MM Successful Deal',
    embedColor: '#FFC107', // Amber/Yellow matching reference design
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
 * Automatically scans a ticket channel to detect Buyer, Seller, Amount, Tx Hash, and Deal Info.
 */
export async function autoDetectDealFromChannel(channel, guildId) {
    let buyerId = null;
    let sellerId = null;
    let usdtAmount = null;
    let txHash = null;
    let dealInfo = null;

    try {
        // 1. Detect Buyer from Ticket Database Data
        const ticketData = await getTicketData(guildId, channel.id);
        if (ticketData?.userId) {
            buyerId = ticketData.userId;
        }

        // 2. Fetch last 50 messages from channel to auto-extract trade details
        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);

        if (messages && messages.size > 0) {
            const msgArray = Array.from(messages.values()).reverse();

            // Find human members in channel
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

            // Regex patterns for Tx Hash, Amount, and Info
            const txRegex = /(0x[a-fA-F0-9]{40,66})|(https?:\/\/(bscscan|etherscan|tronscan|solscan)[^\s]+)/i;
            const amountRegex = /(\b\d+(\.\d+)?\b)\s*(usdt|usd|\$)/i;
            const altAmountRegex = /(amount|total|price|paid|sent)[:\s]*\$?(\d+(\.\d+)?)/i;

            for (const msg of msgArray) {
                if (msg.author.bot) continue;

                const text = msg.content || '';

                // Extract Tx Hash
                if (!txHash) {
                    const txMatch = text.match(txRegex);
                    if (txMatch) {
                        txHash = txMatch[1] || txMatch[2];
                    }
                }

                // Extract USDT Amount
                if (!usdtAmount) {
                    const amtMatch = text.match(amountRegex) || text.match(altAmountRegex);
                    if (amtMatch) {
                        const parsed = parseFloat(amtMatch[1] || amtMatch[2]);
                        if (!isNaN(parsed) && parsed > 0) {
                            usdtAmount = parsed;
                        }
                    }
                }

                // Extract Deal Info
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

    const footerText = `${config.footerText || 'Auto-MM Successful Deal'} | ${timestampText}`;

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
 * Logs a new P2P deal in database and updates stats.
 */
export async function logDeal(guildId, dealData) {
    const dealsKey = getP2PDealsKey(guildId);
    const deals = await getFromDb(dealsKey, []);

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
    const deals = await getFromDb(dealsKey, []);
    
    const completed = deals.filter(d => d.status === 'Completed');
    const totalVolume = completed.reduce((acc, d) => acc + (parseFloat(d.usdtAmount) || 0), 0);

    return {
        totalDeals: deals.length,
        completedDeals: completed.length,
        totalUsdtVolume: totalVolume
    };
}
