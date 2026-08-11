import { MessageFlags } from 'discord.js';
import { createReportTicket } from '../../../services/reportService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'report_details_modal',
    async execute(interaction, client, args) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;

            const targetUserId = args[0];
            if (!targetUserId) {
                return await interaction.editReply({
                    embeds: [errorEmbed('Invalid User', '❌ No target user was selected for reporting.')]
                });
            }

            // Fetch the target user object
            let targetUser = null;
            try {
                targetUser = await client.users.fetch(targetUserId);
            } catch (fetchErr) {
                logger.warn(`Could not fetch target user ${targetUserId}: ${fetchErr.message}`);
                targetUser = targetUserId; // Fallback to raw ID string
            }

            const irritateCheck = interaction.fields.getTextInputValue('irritate_check')?.trim();
            const details = interaction.fields.getTextInputValue('details')?.trim();

            const guild = interaction.guild;
            const reporter = interaction.user;

            const ticketChannel = await createReportTicket(guild, reporter, targetUser, irritateCheck, details, client);

            if (ticketChannel) {
                await interaction.editReply({
                    embeds: [successEmbed(
                        'Report Ticket Created',
                        `✅ Your report ticket has been created: <#${ticketChannel.id}>\n\nPlease click the channel link to provide any additional screenshots or details.`
                    )]
                });

                // Auto-delete the confirmation message after 3 seconds
                setTimeout(async () => {
                    await interaction.deleteReply().catch(() => null);
                }, 3000);
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        'Creation Failed',
                        '❌ Failed to create report ticket channel. Please contact an Administrator.'
                    )]
                });
            }
        } catch (error) {
            logger.error('Error handling report modal submit:', error);
            try {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        'Error Occurred',
                        '❌ An unexpected error occurred while processing your report.'
                    )]
                }).catch(() => null);
            } catch {}
        }
    }
};
