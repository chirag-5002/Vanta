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

        // Clear any previous wizard state
        const key = `${interaction.guildId}:${interaction.user.id}`;
        wizardSelections.delete(key);

        const modal = new ModalBuilder()
            .setCustomId(`p2p_amount_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Step 1`);

        const amountInput = new TextInputBuilder()
            .setCustomId('q1_amount')
            .setLabel(`How much USDT do you want to ${isBuy ? 'BUY' : 'SELL'}?`)
            .setPlaceholder('e.g. 100, 500, or 2500')
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
            const hasManageGuild = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            const hasStaffRole = config.staffRoleId ? interaction.member.roles.cache.has(config.staffRoleId) : false;

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

            // Send "Transaction Successful" embed in the ticket channel
            const successEmbed = new EmbedBuilder()
                .setTitle('🎉 Transaction Successful!')
                .setDescription(
                    `The USDT P2P Transaction has been completed and verified.\n\n` +
                    `> **Buyer:** <@${dealRecord.buyerId}>\n` +
                    `> **Seller:** <@${dealRecord.sellerId}>\n` +
                    `> **Amount:** \`${dealRecord.usdtAmount} USDT\`\n` +
                    `> **Deal Info:** \`${dealRecord.dealInfo}\`\n\n` +
                    `*🔒 This ticket can now be closed.*`
                )
                .setColor('#2ECC71')
                .setFooter({ text: 'Vanta P2P Auto-MM • Transaction Complete' });

            // Post transaction success message publicly in the ticket channel (non-ephemeral)
            await interaction.channel.send({ embeds: [successEmbed] });

            // Reply to the staff interaction
            await interaction.editReply({ content: '✅ Deal details auto-detected and transaction proof posted successfully!' });

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
