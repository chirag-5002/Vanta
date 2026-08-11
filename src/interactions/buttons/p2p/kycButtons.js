import { PermissionFlagsBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const kycStartVerificationButtonHandler = {
    name: 'kyc_start_verification',
    async execute(interaction, client, args) {
        const { startKycVerificationFlow } = await import('../../../services/kycService.js');
        return await startKycVerificationFlow(interaction, client);
    }
};

export const kycTicketSubmitButtonHandler = {
    name: 'kyc_ticket_submit',
    async execute(interaction, client, args) {
        const userId = args[0] || interaction.user.id;
        const { submitKycVerification } = await import('../../../services/kycService.js');
        return await submitKycVerification(interaction, client, userId);
    }
};

export const kycStaffApproveButtonHandler = {
    name: 'kyc_staff_approve',
    async execute(interaction, client, args) {
        const userId = args[0];
        if (!userId) {
            return await interaction.reply({ content: '❌ Invalid target user ID.', flags: MessageFlags.Ephemeral });
        }

        const { getP2PConfig } = await import('../../../services/p2pService.js');
        const p2pConfig = await getP2PConfig(interaction.guildId);
        
        const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
        const hasStaffRole = p2pConfig.staffRoleId && interaction.member
            ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(p2pConfig.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(p2pConfig.staffRoleId))
            : false;

        if (!hasManageGuild && !hasStaffRole && interaction.user.id !== interaction.guild.ownerId) {
            return await interaction.reply({
                content: '❌ Only authorized staff or admins can approve KYC submissions.',
                flags: MessageFlags.Ephemeral
            });
        }

        const { approveKyc } = await import('../../../services/kycService.js');
        return await approveKyc(interaction.guild, userId, interaction.member, client, interaction);
    }
};

export const kycStaffRejectButtonHandler = {
    name: 'kyc_staff_reject',
    async execute(interaction, client, args) {
        const userId = args[0];
        if (!userId) {
            return await interaction.reply({ content: '❌ Invalid target user ID.', flags: MessageFlags.Ephemeral });
        }

        const { getP2PConfig } = await import('../../../services/p2pService.js');
        const p2pConfig = await getP2PConfig(interaction.guildId);
        
        const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
        const hasStaffRole = p2pConfig.staffRoleId && interaction.member
            ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(p2pConfig.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(p2pConfig.staffRoleId))
            : false;

        if (!hasManageGuild && !hasStaffRole && interaction.user.id !== interaction.guild.ownerId) {
            return await interaction.reply({
                content: '❌ Only authorized staff or admins can reject KYC submissions.',
                flags: MessageFlags.Ephemeral
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`kyc_reject_modal:${userId}`)
            .setTitle('❌ Reject KYC');

        const reasonInput = new TextInputBuilder()
            .setCustomId('q_reject_reason')
            .setLabel('Reason for Rejection')
            .setPlaceholder('e.g. Blurred text, selfie holding wrong ID, etc.')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }
};

export default [
    kycStartVerificationButtonHandler,
    kycTicketSubmitButtonHandler,
    kycStaffApproveButtonHandler,
    kycStaffRejectButtonHandler,
];
