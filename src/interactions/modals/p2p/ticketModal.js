import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createTicket } from '../../../services/ticket.js';
import { getFromDb, setInDb, getP2PUserStatsKey } from '../../../utils/database.js';
import { getP2PConfig, getP2PPaymentConfig, buildBuyPaymentEmbed, buildSellPaymentEmbed, getUserDailyOnlineSpent, addDailyOnlineSpent, isNightRestricted } from '../../../services/p2pService.js';
import { logger } from '../../../utils/logger.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { wizardSelections, buildWizardComponents } from '../../selectMenus/p2p/p2pWizardSelect.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';

function safeGetField(fields, ...keys) {
    if (!fields) return null;
    for (const key of keys) {
        try {
            const val = fields.getTextInputValue(key);
            if (val) return val;
        } catch (_) {
            // Ignore missing field errors
        }
    }
    return null;
}

// ==================== STEP 2: Amount Modal Submit → Show Dropdowns ====================

export const p2pAmountModalHandler = {
    name: 'p2p_amount_modal',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const isBuy = tradeType === 'buy';
        const isKyc = kycType === 'kyc';

        const config = await getP2PConfig(interaction.guildId);
        if (config?.disabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **We are not doing any transactions right now. Soon we will operate.**`
            });
        }

        if (isBuy && config?.buyDisabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **Buy transactions are currently offline. Soon we will operate.**`
            });
        }

        if (!isBuy && config?.sellDisabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **Sell transactions are currently offline. Soon we will operate.**`
            });
        }

        // Check time restriction (11 PM to 9 AM Kolkata timezone) with manual override and staff bypass
        if (isNightRestricted(config, interaction)) {
            await interaction.reply({
                content: `⚠️ **We are not doing transactions between 11pm and 9am.**\n*This message will automatically disappear in 5 minutes.*`,
                flags: MessageFlags.Ephemeral
            });

            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (e) {
                    // Ignore errors (e.g. if user already dismissed/deleted it or interaction expired)
                }
            }, 5 * 60 * 1000);
            return;
        }

        // 1. Check if user is P2P banned
        const banUntil = await getFromDb(`guild:${interaction.guildId}:p2p:ban_until:${interaction.user.id}`, 0);
        if (banUntil && Date.now() < banUntil) {
            const expiresTimestamp = Math.floor(banUntil / 1000);
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **You are currently banned from using the P2P Buy/Sell systems.**\n\n**Reason:** Created multiple P2P tickets without completing payments/transactions (Timepass).\n**Banned Until:** <t:${expiresTimestamp}:F> (<t:${expiresTimestamp}:R>)`
            });
        }

        // 2. Check daily P2P ticket limit (Max 3/day)
        const today = new Date().toISOString().split('T')[0];
        const dailyTicketsKey = `guild:${interaction.guildId}:p2p:daily_tickets:${interaction.user.id}:${today}`;
        const dailyCount = await getFromDb(dailyTicketsKey, 0);
        if (dailyCount >= 3) {
            const userStatsKey = getP2PUserStatsKey(interaction.guildId, interaction.user.id);
            const stats = await getFromDb(userStatsKey, { completedDeals: 0 });
            const completedDeals = stats?.completedDeals || 0;

            if (completedDeals === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: `❌ **Limit Exceeded:** You can create a maximum of **3 P2P tickets** (Buy/Sell combined) per day.\n\nYou have already created ${dailyCount} tickets today. Please try again tomorrow.`
                });
            }
        }

        const amountRaw = safeGetField(interaction.fields, 'q1_amount') || '';
        const cleanedAmount = amountRaw.trim().replace(/^\$/, '');
        const amountVal = parseFloat(cleanedAmount);

        if (isNaN(amountVal)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '❌ Please enter a valid number for the USDT amount.'
            });
        }

        const minLimit = config?.minTradeAmount !== undefined ? config.minTradeAmount : 50;

        if (amountVal < minLimit) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ The minimum trading amount is **${minLimit} USDT**. Please enter a value of ${minLimit} or greater.`
            });
        }

        const amount = amountVal.toString();

        const dailyOnlineSpent = isBuy ? await getUserDailyOnlineSpent(interaction.guildId, interaction.user.id) : 0;
        const isOverLimit = isBuy && (amountVal > 250 || (dailyOnlineSpent + amountVal > 250));
        const autoMethod = isOverLimit ? 'CDM' : null;

        // Store amount and limit tracking in wizard selections
        const key = `${interaction.guildId}:${interaction.user.id}`;
        wizardSelections.set(key, {
            tradeType,
            kycType,
            amount,
            amountVal,
            dailyOnlineSpent,
            paymentMethod: autoMethod
        });

        let routingNotice = '';
        if (isBuy) {
            if (amountVal > 250) {
                routingNotice = `\n\n🏦 **High-Value Order Routing (> 250 USDT):**\n` +
                    `> Orders above **250 USDT** are exclusively processed via **Cash Deposit Machine (CDM)** for maximum bank security and zero freeze risk. Online methods (UPI/IMPS) are disabled.`;
            } else if (dailyOnlineSpent + amountVal > 250) {
                routingNotice = `\n\n🏦 **Daily Online Quota Reached:**\n` +
                    `> You have used **${dailyOnlineSpent.toFixed(2)} / 250 USDT** of your daily online quota.\n` +
                    `> Adding **${amountVal} USDT** exceeds the daily cap of 250 USDT. **Cash Deposit Machine (CDM)** is automatically selected.`;
            } else {
                const remaining = 250 - dailyOnlineSpent;
                routingNotice = `\n\n💳 **Daily Online Quota:** **${remaining.toFixed(2)} USDT** remaining today for UPI/IMPS.`;
            }
        }

        // Build ephemeral message with dropdowns
        const embed = new EmbedBuilder()
            .setTitle(`${isBuy ? '🛒 Buy' : '🔴 Sell'} ${amount} USDT — Select Options`)
            .setDescription(
                `**Amount:** \`${amount} USDT\` ✅\n\n` +
                `Now select your options below:\n\n` +
                `> 1️⃣ Choose your **${isBuy ? 'Payment' : 'Payout'} Method**\n` +
                `> 2️⃣ Choose your **Crypto Network**\n` +
                `> 3️⃣ Click **Next** to enter ${isBuy ? 'wallet address' : 'payout details'}\n\n` +
                `*${isKyc ? '🔒 KYC Verified Trade' : '⚡ Non-KYC Quick Trade'}*` +
                routingNotice
            )
            .setColor(isBuy ? '#2ECC71' : '#E74C3C')
            .setFooter({ text: 'ICN P2P • Select options then click Next' });

        // Next + Cancel buttons and menus generated by builder helper
        const paymentConfig = await getP2PPaymentConfig(interaction.guildId);
        const updatedComponents = buildWizardComponents(tradeType, kycType, autoMethod, null, paymentConfig, amountVal, dailyOnlineSpent);

        await interaction.reply({
            embeds: [embed],
            components: updatedComponents,
            flags: MessageFlags.Ephemeral,
        });
    }
};

// ==================== FINAL STEP: Details Modal Submit → Create Ticket ====================

export const p2pDetailsModalHandler = {
    name: 'p2p_details_modal',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const isBuy = tradeType === 'buy';

        const config = await getP2PConfig(interaction.guildId);
        if (config?.disabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **We are not doing any transactions right now. Soon we will operate.**`
            });
        }

        if (isBuy && config?.buyDisabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **Buy transactions are currently offline. Soon we will operate.**`
            });
        }

        if (!isBuy && config?.sellDisabled) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `❌ **Sell transactions are currently offline. Soon we will operate.**`
            });
        }

        // Check time restriction (11 PM to 9 AM Kolkata timezone)
        // Check time restriction (11 PM to 9 AM Kolkata timezone) with manual override and staff bypass
        if (isNightRestricted(config, interaction)) {
            await interaction.reply({
                content: `⚠️ **We are not doing transactions between 11pm and 9am.**\n*This message will automatically disappear in 5 minutes.*`,
                flags: MessageFlags.Ephemeral
            });

            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (e) {
                    // Ignore errors (e.g. if user already dismissed/deleted it or interaction expired)
                }
            }, 5 * 60 * 1000);
            return;
        }

        await interaction.deferUpdate().catch(() => null);

        try {
            const kycType = args[1] || 'kyc';
            const isKyc = kycType === 'kyc';

            // Get stored wizard selections
            const key = `${interaction.guildId}:${interaction.user.id}`;
            const selections = wizardSelections.get(key) || {};

            const minLimit = config?.minTradeAmount !== undefined ? config.minTradeAmount : 50;

            const amountDisplay = selections.amount || minLimit.toString();
            const paymentMethod = (selections.paymentMethod || 'UPI').toUpperCase();
            const networkRaw = selections.network || 'USDT_TRC20';
            const networkLabel = networkRaw.replace(/_/g, ' ').toUpperCase();

            let addressDisplay = 'N/A';
            if (isBuy) {
                addressDisplay = safeGetField(interaction.fields, 'q_address') || 'N/A';
            } else {
                addressDisplay = safeGetField(interaction.fields, 'q_details') || 'N/A';
            }

            const amountVal = parseFloat(amountDisplay) || 0;
            if (isBuy && (paymentMethod === 'UPI' || paymentMethod === 'IMPS')) {
                const dailyOnlineSpent = await getUserDailyOnlineSpent(interaction.guildId, interaction.user.id);
                if (amountVal > 250 || (dailyOnlineSpent + amountVal > 250)) {
                    wizardSelections.delete(key);
                    return await interaction.followUp({
                        content: `❌ **Daily Online Limit Exceeded:** Purchases over 250 USDT or cumulative daily online purchases > 250 USDT must use **Cash Deposit Machine (CDM)**. Your used quota today is \`${dailyOnlineSpent.toFixed(2)} / 250 USDT\`.\nPlease restart the trade and select **CDM**.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            // Clean up wizard selections
            wizardSelections.delete(key);
            const paymentConfig = await getP2PPaymentConfig(interaction.guildId);

            const reason = `${isBuy ? 'Buy' : 'Sell'} ${amountDisplay} USDT via ${paymentMethod} (${networkLabel})`;

            // Dynamically detect marketplace category
            const marketCategory = interaction.guild.channels.cache.find(c => 
                c.type === ChannelType.GuildCategory && 
                (c.name.toLowerCase().includes('market') || 
                 c.name.toLowerCase().includes('p2p') || 
                 c.name.toLowerCase().includes('portal'))
            );
            const targetCategoryId = marketCategory ? marketCategory.id : null;

            // 1. Create Private Ticket Channel
            const result = await createTicket(
                interaction.guild,
                interaction.member,
                targetCategoryId,
                reason,
                'none'
            );

            const ticketChannel = result.channel;

            // Increment daily P2P ticket count
            const today = new Date().toISOString().split('T')[0];
            const dailyTicketsKey = `guild:${interaction.guildId}:p2p:daily_tickets:${interaction.user.id}:${today}`;
            const dailyCount = await getFromDb(dailyTicketsKey, 0);
            await setInDb(dailyTicketsKey, dailyCount + 1);

            // 2. Strict Permissions Setup
            const staffRoleId = config.staffRoleId;
            const permissionOverlays = [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
                },
                {
                    id: interaction.client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
                }
            ];

            if (staffRoleId && interaction.guild.roles.cache.has(staffRoleId)) {
                permissionOverlays.push({
                    id: staffRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
                });
            }

            await ticketChannel.permissionOverwrites.set(permissionOverlays).catch(() => null);

            // 3. Resolve Daily Prices and Build Ticket Welcome Summary Card
            const { resolveLatestPrices } = await import('../../../services/p2pService.js');
            const { buyPrice, sellPrice } = await resolveLatestPrices(interaction.guild);

            const title = isBuy
                ? `🛒 Buy USDT Trade Request (${isKyc ? 'KYC Verified' : 'Non-KYC'})`
                : `🔴 Sell USDT Trade Request (${isKyc ? 'KYC Verified' : 'Non-KYC'})`;

            const verificationTag = isKyc ? 'KYC Verified Deal' : 'Non-KYC Deal';
            let cardDescription = '';

            let buyReceiveUsdt = 0;
            let buyTotalInr = 0;

            if (isBuy) {
                const isTrc = networkRaw.toUpperCase().includes('TRC');
                const trcNetworkFee = isTrc ? 2 : 0;
                const totalInr = amountVal * buyPrice;
                buyTotalInr = totalInr;
                let baseFee = 0;
                let feePercentage = '';
                if (isKyc) {
                    if (amountVal < 500) {
                        baseFee = 2;
                        feePercentage = '$2';
                    } else {
                        baseFee = amountVal * 0.005;
                        feePercentage = '0.5%';
                    }
                } else {
                    if (amountVal <= 100) {
                        baseFee = 2;
                        feePercentage = '$2';
                    } else if (amountVal <= 500) {
                        baseFee = 3;
                        feePercentage = '$3';
                    } else if (amountVal <= 1200) {
                        baseFee = 5;
                        feePercentage = '$5';
                    } else {
                        baseFee = amountVal * 0.005;
                        feePercentage = '0.5%';
                    }
                }
                const totalFee = baseFee + trcNetworkFee;
                const receiveUsdt = Math.max(0, amountVal - totalFee);
                buyReceiveUsdt = receiveUsdt;

                const feeBreakdownText = isTrc 
                    ? `\`${feePercentage}\` base fee + \`$2\` TRC fee` 
                    : `\`${feePercentage}\` fee`;

                cardDescription = [
                    `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n`,
                    `> **Trader / Creator:** \`${interaction.user.id}\``,
                    `> **Trade Direction:** \`BUY USDT\``,
                    `> **1. Requested Amount:** \`${amountDisplay} USDT\``,
                    `> **2. Current Buy Rate:** \`₹${buyPrice.toFixed(2)} INR\``,
                    `> **3. Total INR to Pay:** \`₹${totalInr.toFixed(2)} INR\``,
                    `> **4. Verification:** \`${verificationTag}\` (${feeBreakdownText})`,
                    `> **5. Net USDT You Receive:** \`${receiveUsdt.toFixed(2)} USDT\``,
                    `> **6. Payment Method:** \`${paymentMethod}\``,
                    `> **7. Crypto Network:** \`${networkLabel}\``,
                    `> **8. Your Receiving Wallet Address:** \`${addressDisplay}\``,
                    `> **Security:** \`Auto-MM Protected Trade\``
                ].join('\n');
            } else {
                const netUsdtForPayout = amountVal;
                let totalInrPayout = netUsdtForPayout * sellPrice;
                if (isKyc) {
                    totalInrPayout = totalInrPayout - 100;
                } else {
                    totalInrPayout = totalInrPayout - 250;
                }
                const feeDetails = isKyc ? 'Flat ₹100 network fee' : 'Flat ₹250 non-KYC fee';

                cardDescription = [
                    `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n`,
                    `> **Trader / Creator:** \`${interaction.user.id}\``,
                    `> **Trade Direction:** \`SELL USDT\``,
                    `> **1. Requested Amount:** \`${amountDisplay} USDT\``,
                    `> **2. Current Sell Rate:** \`₹${sellPrice.toFixed(2)} INR\``,
                    `> **3. Verification:** \`${verificationTag}\` (\`${feeDetails}\`)`,
                    `> **4. Net Payout You Receive:** \`₹${totalInrPayout.toFixed(2)} INR\``,
                    `> **5. Payout Method:** \`${paymentMethod}\``,
                    `> **6. Payout Details (${paymentMethod}):** \`${addressDisplay}\``,
                    `> **7. Deposit Crypto Network:** \`${networkLabel}\``,
                    `> **Security:** \`Auto-MM Protected Trade\``
                ].join('\n');
            }

            // Security & Claim Disclaimer note at bottom of summary card
            const securityNotice = [
                '',
                '🔒 **Official Payment Security Notice:**',
                '> Official payment details / deposit account will be provided right here once a verified **Staff Member claims your ticket**.',
                '> ⚠️ **Anti-Scam Alert:** Never accept payment details in DMs. All official payment details appear inside this ticket only after staff claim.'
            ].join('\n');
            cardDescription += '\n' + securityNotice;

            const summaryEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(cardDescription)
                .setColor(isBuy ? '#2ECC71' : '#E74C3C')
                .setFooter({ text: 'ICN P2P Trade System • Keep all trade chats inside this channel' });

            const controlsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('p2p_autolog_ticket_btn')
                    .setLabel('⚡ Auto-Log Deal Proof')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${staffRoleId ? `<@&${staffRoleId}>` : ''}`,
                embeds: [summaryEmbed],
                components: [controlsRow]
            });

            // Store P2P trade payload on ticketData to be dispatched upon ticket claim
            try {
                const { getTicketData, saveTicketData } = await import('../../../utils/database.js');
                const ticketData = await getTicketData(interaction.guildId, ticketChannel.id).catch(() => null);
                if (ticketData) {
                    ticketData.p2pTrade = {
                        isBuy,
                        paymentMethod,
                        networkLabel,
                        buyTotalInr,
                        buyReceiveUsdt,
                        amountVal,
                        sellPrice,
                        totalInrPayout: isBuy ? buyTotalInr : totalInrPayout,
                        isKyc,
                    };
                    ticketData.paymentDispatched = false;
                    await saveTicketData(interaction.guildId, ticketChannel.id, ticketData);
                }
            } catch (err) {
                logger.error('Failed to attach P2P trade data to ticket:', err);
            }

            // Track daily online spent for user if Buy via online methods (UPI/IMPS)
            if (isBuy && (paymentMethod === 'UPI' || paymentMethod === 'IMPS')) {
                try {
                    await addDailyOnlineSpent(interaction.guildId, interaction.user.id, amountVal);
                } catch (err) {
                    logger.error('Failed to increment daily online spent:', err);
                }
            }

            await interaction.editReply({
                content: `✅ Your **${isBuy ? 'Buy' : 'Sell'} USDT Ticket** has been created in <#${ticketChannel.id}>!`,
                embeds: [],
                components: []
            }).catch(() => null);

            // Clean up any messages sent by the ticket creator in the P2P portal channels
            try {
                const guildChannels = await interaction.guild.channels.fetch().catch(() => null) || interaction.guild.channels.cache;
                if (guildChannels) {
                    const portalChannels = guildChannels.filter(c => c && c.isTextBased() && (
                        c.name.includes('looking-to-buy') || c.name.includes('buy-usdt') || c.name === 'buy' ||
                        c.name.includes('looking-to-sell') || c.name.includes('sell-usdt') || c.name === 'sell'
                    ));
                    for (const ch of portalChannels.values()) {
                        const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
                        if (msgs) {
                            const userMsgs = msgs.filter(m => m.author.id === interaction.user.id);
                            for (const m of userMsgs.values()) {
                                await m.delete().catch(() => null);
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error('Failed to clear user portal messages:', err);
            }

            setTimeout(async () => {
                await interaction.deleteReply().catch(() => null);
            }, 3000);

        } catch (err) {
            logger.error('Failed to create ticket from wizard:', err);
            const userMsg = err.userMessage || err.message || 'Failed to create ticket channel.';
            await interaction.editReply({
                content: `❌ Ticket Creation Failed.`,
                embeds: [errorEmbed('Ticket Creation Notice', userMsg)],
                components: []
            }).catch(() => null);
        }
    }
};

export default [
    p2pAmountModalHandler,
    p2pDetailsModalHandler,
];
