import { UserSelectMenuBuilder, ActionRowBuilder, MessageFlags } from 'discord.js';

export default {
    name: 'report_user_button',
    async execute(interaction, client) {
        const selectMenu = new UserSelectMenuBuilder()
            .setCustomId('report_select_user')
            .setPlaceholder('🔍 Search and select a server member...')
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '👤 **Who do you want to report?** Please search and select the member from the dropdown below:',
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
};
