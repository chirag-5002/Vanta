import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { wizardSelections } from '../../selectMenus/p2p/p2pWizardSelect.js';
import { logger } from '../../../utils/logger.js';

// ==================== STEP 1: Show Amount Modal ====================

export const p2pTradeButtonHandler = {
    name: 'p2p_trade_btn',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const isBuy = tradeType === 'buy';

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

        const modal = new ModalBuilder()
            .setCustomId(`p2p_amount_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Step 1`);

        const amountInput = new TextInputBuilder()
            .setCustomId('q1_amount')
            .setLabel(`How much USDT to ${isBuy ? 'BUY' : 'SELL'}? (Min. 100)`)
            .setPlaceholder('Minimum 100 USDT (e.g. 150, 500)')
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
