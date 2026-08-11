import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export default {
    name: 'report_user_button',
    async execute(interaction, client) {
        const modal = new ModalBuilder()
            .setCustomId('report_user_modal')
            .setTitle('Report a User');

        const targetUserInput = new TextInputBuilder()
            .setCustomId('target_user')
            .setLabel('Who do you want to report?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type their username or mention them (e.g. @username)')
            .setMaxLength(100)
            .setRequired(true);

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

        const row1 = new ActionRowBuilder().addComponents(targetUserInput);
        const row2 = new ActionRowBuilder().addComponents(irritateCheckInput);
        const row3 = new ActionRowBuilder().addComponents(detailsInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    }
};
