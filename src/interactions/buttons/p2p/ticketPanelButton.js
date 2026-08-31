import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { wizardSelections } from '../../selectMenus/p2p/p2pWizardSelect.js';
import { getFromDb, getP2PUserStatsKey } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getP2PConfig } from '../../../services/p2pService.js';

// ==================== STEP 1: Show Amount Modal ====================

export const p2pTradeButtonHandler = {
    name: 'p2p_trade_btn',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const isBuy = tradeType === 'buy';

        const config = await getP2PConfig(interaction.guildId);
        if (config?.disabled) {
            return await interaction.reply({
                content: `❌ **We are not doing any transactions right now. Soon we will operate.**`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (isBuy && config?.buyDisabled) {
            return await interaction.reply({
                content: `❌ **Buy transactions are currently offline. Soon we will operate.**`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!isBuy && config?.sellDisabled) {
            return await interaction.reply({
                content: `❌ **Sell transactions are currently offline. Soon we will operate.**`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check time restriction (11 PM to 9 AM Kolkata timezone)
        const kolkataTimeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(new Date());
        const hour = parseInt(kolkataTimeStr, 10);
        if (hour >= 23 || hour < 9) {
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
            return await interaction.reply({
                content: `❌ **You are currently banned from using the P2P Buy/Sell systems.**\n\n**Reason:** Created multiple P2P tickets without completing payments/transactions (Timepass).\n**Banned Until:** <t:${expiresTimestamp}:F> (<t:${expiresTimestamp}:R>)`,
                flags: MessageFlags.Ephemeral
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
                return await interaction.reply({
                    content: `❌ **Limit Exceeded:** You can create a maximum of **3 P2P tickets** (Buy/Sell combined) per day.\n\nYou have already created ${dailyCount} tickets today. Please try again tomorrow.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // KYC check if required
        if (kycType === 'kyc') {
            const { getKycStatus } = await import('../../../services/kycService.js');
            const kycStatus = await getKycStatus(interaction.guildId, interaction.user.id);
            
            if (kycStatus.status !== 'verified') {
                const statusLabel = kycStatus.status === 'pending' ? '⏳ Pending Review' : kycStatus.status === 'rejected' ? '❌ Rejected' : 'Not Started';
                const embed = new EmbedBuilder()
                    .setTitle('🔒 KYC Verification Required')
                    .setDescription(
                        `To trade with KYC on this server, you must complete identity verification first.\n\n` +
                        `• **Current Status:** \`${statusLabel}\`\n` +
                        (kycStatus.status === 'rejected' ? `• **Reason:** \`${kycStatus.rejectionReason}\`\n\n` : '\n') +
                        `Please click the button below to start your one-time verification.`
                    )
                    .setColor('#FFC107');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('kyc_start_verification')
                        .setLabel('🔒 Start KYC Verification')
                        .setStyle(ButtonStyle.Success)
                );

                return await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Clear any previous wizard state
        const key = `${interaction.guildId}:${interaction.user.id}`;
        wizardSelections.delete(key);

        const config = await getP2PConfig(interaction.guildId);
        const minLimit = config?.minTradeAmount !== undefined ? config.minTradeAmount : 50;

        const modal = new ModalBuilder()
            .setCustomId(`p2p_amount_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Step 1`);

        const amountInput = new TextInputBuilder()
            .setCustomId('q1_amount')
            .setLabel(`How much USDT to ${isBuy ? 'BUY' : 'SELL'}? (Min. ${minLimit})`)
            .setPlaceholder(`Minimum ${minLimit} USDT (e.g. ${minLimit + 50}, ${minLimit + 450})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
    }
};

// ==================== STEP 3: Proceed → Show Details Modal ====================

export const wizardProceedButtonHandler = {
    name: 'p2p_wizard_proceed',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const isBuy = tradeType === 'buy';

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const selections = wizardSelections.get(key) || {};

        // Validate both dropdowns were selected
        if (!selections.paymentMethod || !selections.network) {
            const missing = [];
            if (!selections.paymentMethod) missing.push(`**${isBuy ? 'Payment' : 'Payout'} Method**`);
            if (!selections.network) missing.push('**Crypto Network**');
            await interaction.reply({
                content: `⚠️ Please select ${missing.join(' and ')} from the dropdowns above before proceeding.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Show final details modal
        const modal = new ModalBuilder()
            .setCustomId(`p2p_details_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Final Step`);

        if (isBuy) {
            const walletInput = new TextInputBuilder()
                .setCustomId('q_address')
                .setLabel('Your Receiving Wallet Address')
                .setPlaceholder('Enter your TRC20 / ERC20 / BEP20 Wallet Address')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(walletInput));
        } else {
            // Dynamic label based on payment method
            const method = selections.paymentMethod;
            const label = method === 'UPI' ? 'Your UPI ID' : 'Bank Account + IFSC Details';
            const placeholder = method === 'UPI'
                ? 'e.g. yourname@upi, 9876543210@paytm'
                : 'e.g. A/C: 1234567890, IFSC: SBIN0001234, Name: ...';

            const detailsInput = new TextInputBuilder()
                .setCustomId('q_details')
                .setLabel(label)
                .setPlaceholder(placeholder)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(detailsInput));
        }

        await interaction.showModal(modal);
    }
};

// ==================== CANCEL BUTTON ====================

export const wizardCancelButtonHandler = {
    name: 'p2p_wizard_cancel',
    async execute(interaction, client, args) {
        const key = `${interaction.guildId}:${interaction.user.id}`;
        wizardSelections.delete(key);

        await interaction.update({
            content: '❌ Trade wizard cancelled.',
            embeds: [],
            components: [],
        });
    }
};

// ==================== PANEL BUTTON ALIASES ====================

export const buyPriceButtonHandler = {
    name: 'p2p_price_buy',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'kyc']);
    }
};

export const sellPriceButtonHandler = {
    name: 'p2p_price_sell',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'kyc']);
    }
};

export const buyKycButtonHandler = {
    name: 'p2p_trade_buy_kyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'kyc']);
    }
};

export const buyNoKycButtonHandler = {
    name: 'p2p_trade_buy_nokyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'nokyc']);
    }
};

export const sellKycButtonHandler = {
    name: 'p2p_trade_sell_kyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'kyc']);
    }
};

export const sellNoKycButtonHandler = {
    name: 'p2p_trade_sell_nokyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'nokyc']);
    }
};

// ==================== AUTO-LOG / COMPLETED TRANSACTION BUTTON ====================

export const p2pAutologTicketButtonHandler = {
    name: 'p2p_autolog_ticket_btn',
    async execute(interaction, client, args) {
        // Defer response ephemerally
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { getP2PConfig, autoDetectAndPublishDeal } = await import('../../../services/p2pService.js');
            const config = await getP2PConfig(interaction.guildId);

            // Permission check: Only staff or admins can complete/log deals
            const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
            const hasStaffRole = config.staffRoleId && interaction.member
                ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(config.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.staffRoleId))
                : false;

            if (!hasManageGuild && !hasStaffRole) {
                const requiredMsg = config.staffRoleId
                    ? `You need the <@&${config.staffRoleId}> role or \`Manage Server\` permission to log deals.`
                    : 'You need the `Manage Server` permission to log P2P deals.';
                await interaction.replyUserError(interaction, { type: 'permission', message: requiredMsg });
                return;
            }

            // Auto-detect deal details from channel messages & publish to deals channel
            const dealRecord = await autoDetectAndPublishDeal(interaction.channel, interaction.guildId, interaction.user.id);
            if (!dealRecord) {
                await interaction.editReply({ content: '❌ Failed to auto-detect/publish deal. Ensure public deal channel is configured via `/p2p setup`.' });
                return;
            }

            // Reply to the staff interaction
            await interaction.editReply({ content: '✅ Deal details auto-detected and transaction proof posted successfully! Ticket will close automatically in 30 minutes.' });

        } catch (err) {
            logger.error('Failed to complete/autolog deal via button:', err);
            await interaction.editReply({ content: `❌ Failed to log deal: ${err.message}` });
        }
    }
};

export default [
    buyPriceButtonHandler,
    sellPriceButtonHandler,
    buyKycButtonHandler,
    buyNoKycButtonHandler,
    sellKycButtonHandler,
    sellNoKycButtonHandler,
    wizardProceedButtonHandler,
    wizardCancelButtonHandler,
    p2pAutologTicketButtonHandler,
];
