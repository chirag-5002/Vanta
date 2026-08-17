import { EmbedBuilder, MessageFlags, ChannelType } from 'discord.js';
import { getFromDb, getP2PDealKey } from '../../../utils/database.js';
import { getP2PConfig } from '../../../services/p2pService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export const vouchModalHandler = {
    name: 'p2p_vouch_modal',
    async execute(interaction, client, args) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const dealId = args[0];
        const ratingRaw = interaction.fields.getTextInputValue('rating');
        const feedback = interaction.fields.getTextInputValue('feedback');

        const ratingNum = Math.min(Math.max(parseInt(ratingRaw, 10) || 5, 1), 5);
        const starsStr = '⭐'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);

        const config = await getP2PConfig(interaction.guildId);

        let dealData = null;
        if (dealId && dealId !== 'GENERAL') {
            const dealKey = getP2PDealKey(interaction.guildId, dealId);
            dealData = await getFromDb(dealKey, null);
        }

        const vouchEmbed = new EmbedBuilder()
            .setTitle('⭐ Verified P2P Trader Vouch')
            .setColor('#2ECC71')
            .addFields(
                { name: 'Vouched By', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
                { name: 'Rating', value: `${starsStr} (${ratingNum}/5)`, inline: true }
            );

        if (dealData) {
            vouchEmbed.addFields(
                { name: 'Deal ID', value: `\`${dealData.dealId}\``, inline: true },
                { name: 'Trade Parties', value: `<@${dealData.buyerId}> ↔️ <@${dealData.sellerId}>`, inline: false },
                { name: 'Trade Amount', value: `${dealData.usdtAmount} USDT ($${dealData.usdAmount})`, inline: true },
                { name: 'Deal Info', value: `${dealData.dealInfo || 'P2P USDT Transfer'}`, inline: true }
            );
        }

        vouchEmbed.addFields(
            { name: 'Feedback / Comment', value: `\`\`\`${feedback}\`\`\``, inline: false }
        );

        vouchEmbed.setFooter({ text: 'ICN P2P Trust Network | Verified Vouch' });
        vouchEmbed.setTimestamp();

        // Target vouch channel: first search for feedback/vouch names
        const guildChannels = await interaction.guild.channels.fetch().catch(() => null) || interaction.guild.channels.cache;
        let targetVouchChannel = guildChannels.find(c => 
            c && c.type === ChannelType.GuildText && 
            (c.name.toLowerCase() === 'feedback-comment' || 
             c.name.toLowerCase().includes('feedback-comment') ||
             c.name.toLowerCase() === 'feedback' ||
             c.name.toLowerCase() === 'feedbacks' ||
             c.name.toLowerCase() === 'vouch' ||
             c.name.toLowerCase() === 'vouches')
        );

        // Fallback to configured vouch channel or interaction channel
        if (!targetVouchChannel) {
            targetVouchChannel = config.vouchChannelId
                ? guildChannels.get(config.vouchChannelId)
                : interaction.channel;
        }

        if (targetVouchChannel) {
            try {
                await targetVouchChannel.send({ embeds: [vouchEmbed] });
            } catch (err) {
                logger.error('Failed to send vouch embed to channel', { error: err.message, channelId: targetVouchChannel.id });
            }
        }

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Vouch Submitted!',
                    `Thank you <@${interaction.user.id}>! Your ${starsStr} vouch has been recorded and posted in ${targetVouchChannel ? `<#${targetVouchChannel.id}>` : 'the vouch channel'}.`
                )
            ]
        });
    }
};

export default [vouchModalHandler];
