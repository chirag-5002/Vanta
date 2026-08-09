import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { wizardSelections } from '../../selectMenus/p2p/p2pWizardSelect.js';

/**
 * Build the ephemeral wizard message with dropdown select menus.
 * Step 1: User selects Payment Method + Network from dropdowns
 * Step 2: User clicks "Proceed" → Modal opens for Amount + Address/Details
 */
function buildWizardMessage(tradeType, kycType) {
    const isBuy = tradeType === 'buy';
    const isKyc = kycType === 'kyc';

    const embed = new EmbedBuilder()
        .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Trade Wizard`)
        .setDescription(
            `**Step 1 of 2** — Select your options below:\n\n` +
            `> 1️⃣ Choose your **${isBuy ? 'Payment' : 'Payout'} Method**\n` +
            `> 2️⃣ Choose your **Crypto Network**\n` +
            `> 3️⃣ Click **Proceed** to enter amount & ${isBuy ? 'wallet address' : 'payout details'}\n\n` +
            `*${isKyc ? '🔒 KYC Verified Trade' : '⚡ Non-KYC Quick Trade'}*`
        )
        .setColor(isBuy ? '#2ECC71' : '#E74C3C')
        .setFooter({ text: 'Vanta P2P • Select both options then click Proceed' });

    // Payment Method dropdown
    const paymentOptions = isBuy
        ? [
            { label: 'UPI', value: 'UPI', emoji: '📱' },
            { label: 'IMPS', value: 'IMPS', emoji: '🏦' },
            { label: 'CDM (Cash Deposit Machine)', value: 'CDM', emoji: '🏧' },
            { label: 'CCW (Crypto-to-Crypto Swap)', value: 'CCW', emoji: '🔄' },
        ]
        : [
            { label: 'UPI', value: 'UPI', emoji: '📱' },
            { label: 'IMPS', value: 'IMPS', emoji: '🏦' },
        ];

    const paymentMenu = new StringSelectMenuBuilder()
        .setCustomId(`p2p_select_payment:${tradeType}:${kycType}`)
        .setPlaceholder(`Select ${isBuy ? 'Payment' : 'Payout'} Method`)
        .addOptions(paymentOptions);

    // Network dropdown
    const networkMenu = new StringSelectMenuBuilder()
        .setCustomId(`p2p_select_network:${tradeType}:${kycType}`)
        .setPlaceholder('Select Crypto Network')
        .addOptions([
            { label: 'USDT TRC20', value: 'USDT_TRC20', emoji: '🟢' },
            { label: 'USDT ERC20', value: 'USDT_ERC20', emoji: '🔵' },
            { label: 'USDT BEP20', value: 'USDT_BEP20', emoji: '🟡' },
        ]);

    // Proceed button
    const proceedButton = new ButtonBuilder()
        .setCustomId(`p2p_wizard_proceed:${tradeType}:${kycType}`)
        .setLabel('✅ Proceed')
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`p2p_wizard_cancel`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(paymentMenu),
            new ActionRowBuilder().addComponents(networkMenu),
            new ActionRowBuilder().addComponents(proceedButton, cancelButton),
        ],
        flags: MessageFlags.Ephemeral,
    };
}

// ==================== MAIN HANDLER ====================

export const p2pTradeButtonHandler = {
    name: 'p2p_trade_btn',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';

        // Clear any previous wizard state for this user
        const key = `${interaction.guildId}:${interaction.user.id}`;
        wizardSelections.delete(key);

        const message = buildWizardMessage(tradeType, kycType);
        await interaction.reply(message);
    }
};

// ==================== PROCEED BUTTON (shows modal for remaining fields) ====================

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
            if (!selections.paymentMethod) missing.push('**Payment Method**');
            if (!selections.network) missing.push('**Crypto Network**');
            await interaction.reply({
                content: `⚠️ Please select ${missing.join(' and ')} from the dropdowns above before proceeding.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Show modal for remaining fields (Amount + Address/Details)
        const modal = new ModalBuilder()
            .setCustomId(`p2p_wizard_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} — Details`);

        const q1Amount = new TextInputBuilder()
            .setCustomId('q1_amount')
            .setLabel(`How much USDT do you want to ${isBuy ? 'BUY' : 'SELL'}?`)
            .setPlaceholder('e.g. 100, 500, or 2500')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        if (isBuy) {
            const q2Address = new TextInputBuilder()
                .setCustomId('q4_address')
                .setLabel('Your Receiving Wallet Address')
                .setPlaceholder('Enter your TRC20 / ERC20 / BEP20 Wallet Address')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1Amount),
                new ActionRowBuilder().addComponents(q2Address)
            );
        } else {
            const q2Details = new TextInputBuilder()
                .setCustomId('q3_details')
                .setLabel('Payout Details (UPI ID / Bank Info)')
                .setPlaceholder('Enter your UPI ID or Bank Account + IFSC Details')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1Amount),
                new ActionRowBuilder().addComponents(q2Details)
            );
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
