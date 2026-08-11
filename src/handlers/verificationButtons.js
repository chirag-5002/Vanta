import { MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This button can only be used in a server.' });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('User clicked verify button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You are already verified and have access to all server channels.' });
        }

        logger.info('User verified via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Verification Successful!",
                `You have been verified and given the **${result.roleName}** role!\n\nYou now have access to all server channels and features. Welcome! 🎉`
            )],
        });

        // Automatically delete/dismiss the verification success ephemeral message after 10 seconds
        setTimeout(async () => {
            await interaction.deleteReply().catch(() => null);
        }, 10000);

        // Send a nice professional greeting in the welcome channel
        try {
            const { ChannelType } = await import('discord.js');
            const guildChannels = await guild.channels.fetch().catch(() => null);
            let welcomeChannel = null;
            if (guildChannels) {
                welcomeChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    (c.name.toLowerCase().includes('welcome') || c.name.toLowerCase().includes('greet') || c.name.toLowerCase().includes('join'))
                );
            }

            if (welcomeChannel) {
                const { generateWelcomeCard } = await import('../utils/welcomeCard.js');
                const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });
                const memberCount = guild.memberCount;
                const cardAttachment = await generateWelcomeCard(avatarUrl, interaction.user.username, guild.name, memberCount);

                await welcomeChannel.send({
                    content: `👋 Welcome <@${userId}> to **${guild.name}**!`,
                    files: [cardAttachment]
                }).catch(() => null);
            }
        } catch (welcomeErr) {
            logger.warn('Failed to send welcome message:', welcomeErr.message);
        }

    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};