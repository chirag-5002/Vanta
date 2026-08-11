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

        // Send a nice professional greeting in the welcome channel
        try {
            const { ChannelType, EmbedBuilder } = await import('discord.js');
            const guildChannels = await guild.channels.fetch().catch(() => null);
            let welcomeChannel = null;
            if (guildChannels) {
                welcomeChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    (c.name.toLowerCase().includes('welcome') || c.name.toLowerCase().includes('greet') || c.name.toLowerCase().includes('join'))
                );
            }

            if (welcomeChannel) {
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('👋 Welcome to Inner Circle Network!')
                    .setDescription(
                        `Welcome <@${userId}> to **ICN**! 🎉\n\n` +
                        `You have successfully completed verification and gained access to the server.\n\n` +
                        `**Getting Started:**\n` +
                        `• Check out our marketplace channels to start trading.\n` +
                        `• Read the server guidelines to keep transactions safe.\n` +
                        `• If you need help, type your query in the support channel.`
                    )
                    .setColor('#2ECC71')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `${guild.name} • Official Member Verified` })
                    .setTimestamp();

                await welcomeChannel.send({
                    content: `👋 Welcome <@${userId}>!`,
                    embeds: [welcomeEmbed]
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