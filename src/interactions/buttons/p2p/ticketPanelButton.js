import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { autoDetectAndPublishDeal } from '../../../services/p2pService.js';
import { successEmbed } from '../../../utils/embeds.js';

export const buyUsdtButtonHandler = {
    name: 'p2p_price_buy',
    async execute(interaction, client, args) {
        const modal = new ModalBuilder()
            .setCustomId('p2p_trade_modal:buy')
            .setTitle('🛒 Open Buy USDT Ticket');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('USDT Amount to Buy')
            .setPlaceholder('e.g. 100 or 500')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const paymentInput = new TextInputBuilder()
            .setCustomId('payment')
            .setLabel('Preferred Payment Method')
            .setPlaceholder('e.g. UPI, IMPS, GPay, Paytm, Bank Transfer')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(amountInput);
        const row2 = new ActionRowBuilder().addComponents(paymentInput);

        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }
};

export const sellUsdtButtonHandler = {
    name: 'p2p_price_sell',
    async execute(interaction, client, args) {
        const modal = new ModalBuilder()
            .setCustomId('p2p_trade_modal:sell')
            .setTitle('🔴 Open Sell USDT Ticket');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('USDT Amount to Sell')
            .setPlaceholder('e.g. 100 or 1000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const paymentInput = new TextInputBuilder()
            .setCustomId('payment')
            .setLabel('Preferred Payout Receiving Method')
            .setPlaceholder('e.g. UPI ID, Bank Transfer, Binance Pay')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(amountInput);
        const row2 = new ActionRowBuilder().addComponents(paymentInput);

        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }
};

export const autoLogTicketButtonHandler = {
    name: 'p2p_autolog_ticket_btn',
    async execute(interaction, client, args) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const dealRecord = await autoDetectAndPublishDeal(interaction.channel, interaction.guildId, interaction.user.id);
        
        if (dealRecord) {
            return await interaction.editReply({
                embeds: [
                    successEmbed(
                        '⚡ Transaction Proof Auto-Logged!',
                        `Auto-scanned ticket channel and published permanent deal proof for **${dealRecord.usdtAmount} USDT**!`
                    )
                ]
            });
        } else {
            return await interaction.editReply({
                content: '⚠️ Auto-log completed or no deal log channel configured.'
            });
        }
    }
};

export default [
    buyUsdtButtonHandler,
    sellUsdtButtonHandler,
    autoLogTicketButtonHandler
];
