import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';

// Export memory store for transient select menu state
export const wizardSelections = new Map();

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
            status += `👉 Both selected! Click **Proceed** to continue.`;
        } else {
            status += `⬜ **Crypto Network:** Not selected yet\n\n`;
            status += `👉 Now select your **Crypto Network** from the dropdown below.`;
        }

        await interaction.update({
            content: status,
            embeds: interaction.message.embeds,
            components: interaction.message.components,
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
            status += `👉 Both selected! Click **Proceed** to continue.`;
        } else {
            status += `👉 Now select your **${isBuy ? 'Payment' : 'Payout'} Method** from the dropdown above.`;
        }

        await interaction.update({
            content: status,
            embeds: interaction.message.embeds,
            components: interaction.message.components,
        }).catch(() => null);
    }
};

export default [
    selectPaymentHandler,
    selectNetworkHandler
];
