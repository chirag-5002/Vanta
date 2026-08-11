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
            const { EmbedBuilder } = await import('discord.js');
            const alreadyEmbed = new EmbedBuilder()
                .setTitle('❌ Already Verified')
                .setDescription('You have already completed verification and have full access to all server channels.')
                .setColor('#E74C3C')
                .setFooter({ text: 'ICN Verification System' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [alreadyEmbed] });

            // Automatically delete/dismiss this ephemeral message after 10 seconds
            setTimeout(async () => {
                await interaction.deleteReply().catch(() => null);
            }, 10000);
            return;
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
            logger.info(`[Welcome] Starting welcome flow for user: ${userId}`);
            const { ChannelType } = await import('discord.js');
            const guildChannels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;
            let welcomeChannel = null;
            if (guildChannels) {
                welcomeChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    (c.name.toLowerCase().includes('welcome') || c.name.toLowerCase().includes('greet') || c.name.toLowerCase().includes('join'))
                );
            }

            logger.info(`[Welcome] Resolved welcome channel: ${welcomeChannel ? `#${welcomeChannel.name} (${welcomeChannel.id})` : 'Not Found'}`);

            if (welcomeChannel) {
                const { generateWelcomeCard } = await import('../utils/welcomeCard.js');
                const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });
                const memberCount = guild.memberCount;
                
                logger.info('[Welcome] Generating welcome card image...');
                const cardAttachment = await generateWelcomeCard(avatarUrl, interaction.user.username, guild.name, memberCount);
                logger.info('[Welcome] Welcome card generated successfully. Sending message...');

                await welcomeChannel.send({
                    content: `👋 Welcome <@${userId}> to **${guild.name}**!`,
                    files: [cardAttachment]
                });
                logger.info('[Welcome] Welcome message sent successfully.');
            }
        } catch (welcomeErr) {
            logger.error('[Welcome] Failed to send welcome message:', welcomeErr);
        }

        // Log the verification to logging-channel-of-verify
        try {
            const { ChannelType, EmbedBuilder } = await import('discord.js');
            const guildChannels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;
            let logChannel = null;
            if (guildChannels) {
                logChannel = guildChannels.find(c => 
                    c && c.type === ChannelType.GuildText && 
                    (c.name.toLowerCase() === 'logging-channel-of-verify' || 
                     c.name.toLowerCase().includes('logging-channel-of-verify') ||
                     c.name.toLowerCase().includes('verify-log') ||
                     c.name.toLowerCase().includes('verification-log'))
                );
            }

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 Member Verification Log')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setDescription(
                        `**User:** <@${userId}> (${interaction.user.tag})\n` +
                        `**User ID:** \`${userId}\`\n` +
                        `**Action:** Verified (Access Granted)\n` +
                        `**Role Assigned:** **${result.roleName}**\n` +
                        `**Method:** Server Button Verification\n` +
                        `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
                    )
                    .setColor('#2ECC71')
                    .setFooter({ text: 'ICN Verification Logging System' })
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                logger.info(`[Logging] Logged verification of user ${userId} to #${logChannel.name}`);
            } else {
                logger.warn('[Logging] Could not find #logging-channel-of-verify channel to log verification event');
            }
        } catch (logErr) {
            logger.error('[Logging] Failed to log verification event to channel:', logErr);
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