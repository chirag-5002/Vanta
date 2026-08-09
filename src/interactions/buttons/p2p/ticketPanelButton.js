import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { wizardSelections } from '../../selectMenus/p2p/p2pWizardSelect.js';

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

export default [
    buyPriceButtonHandler,
    sellPriceButtonHandler,
    buyKycButtonHandler,
    buyNoKycButtonHandler,
    sellKycButtonHandler,
    sellNoKycButtonHandler,
    wizardProceedButtonHandler,
    wizardCancelButtonHandler,
];
