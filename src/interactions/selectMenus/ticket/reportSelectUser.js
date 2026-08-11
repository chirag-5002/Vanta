import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export default {
    name: 'report_select_user',
    async execute(interaction, client) {
        const targetUserId = interaction.values[0];

        // Create the report details modal, passing the target user's ID in the customId
        const modal = new ModalBuilder()
            .setCustomId(`report_details_modal:${targetUserId}`)
            .setTitle('Report Details');

        const irritateCheckInput = new TextInputBuilder()
            .setCustomId('irritate_check')
            .setLabel('Did they disturb or irritate you? (Yes/No)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Yes / No')
            .setMaxLength(20)
            .setRequired(true);

        const detailsInput = new TextInputBuilder()
            .setCustomId('details')
            .setLabel('Provide details of the incident')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe what happened and add any links/evidence...')
            .setMaxLength(1000)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(irritateCheckInput);
        const row2 = new ActionRowBuilder().addComponents(detailsInput);

        modal.addComponents(row1, row2);

        // Show modal immediately
        await interaction.showModal(modal);
    }
};
