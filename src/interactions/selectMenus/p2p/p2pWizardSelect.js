import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';

// Export memory store for transient select menu state
export const wizardSelections = new Map();

/**
 * Builds the interaction components with correct defaults set based on user selections.
 */
export function buildWizardComponents(tradeType, kycType, selectedPayment = null, selectedNetwork = null) {
    const isBuy = tradeType === 'buy';

    // Payment Method Options
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

    // Set default value if selected
    const paymentOptionsMapped = paymentOptions.map(opt => ({
        ...opt,
        default: opt.value === selectedPayment
    }));

    const paymentMenu = new StringSelectMenuBuilder()
        .setCustomId(`p2p_select_payment:${tradeType}:${kycType}`)
        .setPlaceholder(`Select ${isBuy ? 'Payment' : 'Payout'} Method`)
        .addOptions(paymentOptionsMapped);

    // Network Options
    const networkOptions = [
        { label: 'USDT TRC20', value: 'USDT_TRC20', emoji: '🟢' },
        { label: 'USDT BEP20', value: 'USDT_BEP20', emoji: '🟡' },
    ];

    const networkOptionsMapped = networkOptions.map(opt => ({
        ...opt,
        default: opt.value === selectedNetwork
    }));

    const networkMenu = new StringSelectMenuBuilder()
        .setCustomId(`p2p_select_network:${tradeType}:${kycType}`)
        .setPlaceholder('Select Crypto Network')
        .addOptions(networkOptionsMapped);

    // Next + Cancel buttons
    const nextButton = new ButtonBuilder()
        .setCustomId(`p2p_wizard_proceed:${tradeType}:${kycType}`)
        .setLabel('➡️ Next')
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId('p2p_wizard_cancel')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary);

    return [
        new ActionRowBuilder().addComponents(paymentMenu),
        new ActionRowBuilder().addComponents(networkMenu),
        new ActionRowBuilder().addComponents(nextButton, cancelButton),
    ];
}

export const selectPaymentHandler = {
    name: 'p2p_select_payment',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const paymentMethod = interaction.values[0];

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const existing = wizardSelections.get(key) || {};
        existing.paymentMethod = paymentMethod;
        existing.tradeType = existing.tradeType || tradeType;
        existing.kycType = existing.kycType || kycType;
        wizardSelections.set(key, existing);

        const isBuy = tradeType === 'buy';
        const hasNetwork = !!existing.network;

        // Build status message
        let status = `✅ **${isBuy ? 'Payment' : 'Payout'} Method:** \`${paymentMethod}\`\n`;
        if (hasNetwork) {
            status += `✅ **Crypto Network:** \`${existing.network.replace(/_/g, ' ')}\`\n\n`;
            status += `👉 Both selected! Click **Next** to continue.`;
        } else {
            status += `⬜ **Crypto Network:** Not selected yet\n\n`;
            status += `👉 Now select your **Crypto Network** from the dropdown below.`;
        }

        // Rebuild components to show default selection in select menu
        const updatedComponents = buildWizardComponents(tradeType, kycType, existing.paymentMethod, existing.network);

        await interaction.update({
            content: status,
            embeds: interaction.message.embeds,
            components: updatedComponents,
        }).catch(() => null);
    }
};

export const selectNetworkHandler = {
    name: 'p2p_select_network',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const network = interaction.values[0];

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const existing = wizardSelections.get(key) || {};
        existing.network = network;
        existing.tradeType = existing.tradeType || tradeType;
        existing.kycType = existing.kycType || kycType;
        wizardSelections.set(key, existing);

        const isBuy = tradeType === 'buy';
        const hasPayment = !!existing.paymentMethod;

        // Build status message
        let status = '';
        if (hasPayment) {
            status += `✅ **${isBuy ? 'Payment' : 'Payout'} Method:** \`${existing.paymentMethod}\`\n`;
        } else {
            status += `⬜ **${isBuy ? 'Payment' : 'Payout'} Method:** Not selected yet\n`;
        }
        status += `✅ **Crypto Network:** \`${network.replace(/_/g, ' ')}\`\n\n`;

        if (hasPayment) {
            status += `👉 Both selected! Click **Next** to continue.`;
        } else {
            status += `👉 Now select your **${isBuy ? 'Payment' : 'Payout'} Method** from the dropdown above.`;
        }

        // Rebuild components to show default selection in select menu
        const updatedComponents = buildWizardComponents(tradeType, kycType, existing.paymentMethod, existing.network);

        await interaction.update({
            content: status,
            embeds: interaction.message.embeds,
            components: updatedComponents,
        }).catch(() => null);
    }
};

export default [
    selectPaymentHandler,
    selectNetworkHandler
];
