import { MessageFlags } from 'discord.js';

export const kycRejectModalHandler = {
    name: 'kyc_reject_modal',
    async execute(interaction, client, args) {
        const userId = args[0];
        if (!userId) {
            return await interaction.reply({ content: '❌ Invalid target user ID.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reason = interaction.fields.getTextInputValue('q_reject_reason') || 'No reason provided';
        const { rejectKyc } = await import('../../../services/kycService.js');

        await rejectKyc(interaction.guild, userId, reason, interaction.member, client, interaction);

        await interaction.editReply({ content: '✅ KYC submission rejected and user notified.' });
    }
};

export default [
    kycRejectModalHandler
];
