import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { infoEmbed } from '../../../utils/embeds.js';

export const vouchButtonHandler = {
    name: 'p2p_vouch_btn',
    async execute(interaction, client, args) {
        const dealId = args[0] || 'GENERAL';

        const modal = new ModalBuilder()
            .setCustomId(`p2p_vouch_modal:${dealId}`)
            .setTitle('Submit Deal Vouch & Feedback');

        const ratingInput = new TextInputBuilder()
            .setCustomId('rating')
            .setLabel('Rating (1 to 5 Stars)')
            .setPlaceholder('5')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(1)
            .setRequired(true);

        const feedbackInput = new TextInputBuilder()
            .setCustomId('feedback')
            .setLabel('Vouch Comment / Trade Review')
            .setPlaceholder('Legit trader! Very fast USDT transfer. Highly recommended +rep')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(5)
            .setMaxLength(500)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(ratingInput);
        const row2 = new ActionRowBuilder().addComponents(feedbackInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    }
};

export const gotoVouchButtonHandler = {
    name: 'p2p_goto_vouch',
    async execute(interaction, client, args) {
        const vouchChannelId = args[0];
        if (!vouchChannelId) {
            return await interaction.reply({
                embeds: [infoEmbed('Vouch Channel', 'Please check the server vouches channel.')],
                flags: MessageFlags.Ephemeral
            });
        }

        return await interaction.reply({
            content: `👉 Head over to <#${vouchChannelId}> to view and leave trader vouches!`,
            flags: MessageFlags.Ephemeral
        });
    }
};

export default [
    vouchButtonHandler,
    gotoVouchButtonHandler
];
