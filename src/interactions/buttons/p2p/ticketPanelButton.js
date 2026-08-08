import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createTicket } from '../../../services/ticket.js';
import { getP2PConfig, autoDetectAndPublishDeal } from '../../../services/p2pService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

export const buyUsdtButtonHandler = {
    name: 'p2p_price_buy',
    async execute(interaction, client, args) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const config = await getP2PConfig(interaction.guildId);

            // 1-Click instant ticket creation (NO modal pop-up required)
            const result = await createTicket(
                interaction.guild,
                interaction.member,
                null,
                'Buy USDT Trade Request',
                'none'
            );

            const ticketChannel = result.channel;

            const embed = new EmbedBuilder()
                .setTitle('🛒 Buy USDT Trade Ticket')
                .setDescription(
                    `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n\n` +
                    `> **Trader:** <@${interaction.user.id}>\n` +
                    `> **Trade Direction:** \`BUY USDT\`\n` +
                    `> **Security:** \`Auto-MM Protected Trade\`\n\n` +
                    `*Please share your required USDT amount, payment method (UPI/IMPS/Bank), and wallet address in this channel.*`
                )
                .setColor('#2ECC71')
                .setFooter({ text: 'Vanta P2P Trade System • Keep all trade chats inside this channel' });

            const controlsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('p2p_autolog_ticket_btn')
                    .setLabel('⚡ Auto-Log Deal Proof')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${config.staffRoleId ? `<@&${config.staffRoleId}>` : ''}`,
                embeds: [embed],
                components: [controlsRow]
            });

            await interaction.editReply({
                content: `✅ Your **Buy USDT Ticket** has been created in <#${ticketChannel.id}>!`
            });

        } catch (err) {
            logger.error('Failed to 1-click create Buy USDT ticket:', err);
            await interaction.editReply({
                content: `❌ Failed to create ticket: ${err.message || 'Please try again in a moment.'}`
            });
        }
    }
};

export const sellUsdtButtonHandler = {
    name: 'p2p_price_sell',
    async execute(interaction, client, args) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const config = await getP2PConfig(interaction.guildId);

            // 1-Click instant ticket creation (NO modal pop-up required)
            const result = await createTicket(
                interaction.guild,
                interaction.member,
                null,
                'Sell USDT Trade Request',
                'none'
            );

            const ticketChannel = result.channel;

            const embed = new EmbedBuilder()
                .setTitle('🔴 Sell USDT Trade Ticket')
                .setDescription(
                    `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n\n` +
                    `> **Trader:** <@${interaction.user.id}>\n` +
                    `> **Trade Direction:** \`SELL USDT\`\n` +
                    `> **Security:** \`Auto-MM Protected Trade\`\n\n` +
                    `*Please share your USDT amount to sell, preferred payout method (UPI/Bank), and deal details in this channel.*`
                )
                .setColor('#E74C3C')
                .setFooter({ text: 'Vanta P2P Trade System • Keep all trade chats inside this channel' });

            const controlsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('p2p_autolog_ticket_btn')
                    .setLabel('⚡ Auto-Log Deal Proof')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${config.staffRoleId ? `<@&${config.staffRoleId}>` : ''}`,
                embeds: [embed],
                components: [controlsRow]
            });

            await interaction.editReply({
                content: `✅ Your **Sell USDT Ticket** has been created in <#${ticketChannel.id}>!`
            });

        } catch (err) {
            logger.error('Failed to 1-click create Sell USDT ticket:', err);
            await interaction.editReply({
                content: `❌ Failed to create ticket: ${err.message || 'Please try again in a moment.'}`
            });
        }
    }
};

export const autoLogTicketButtonHandler = {
    name: 'p2p_autolog_ticket_btn',
    async execute(interaction, client, args) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const dealRecord = await autoDetectAndPublishDeal(interaction.channel, interaction.guildId, interaction.user.id);
        
        if (dealRecord) {
            return await interaction.editReply({
                embeds: [
                    successEmbed(
                        '⚡ Transaction Proof Auto-Logged!',
                        `Auto-scanned ticket channel and published permanent deal proof for **${dealRecord.usdtAmount} USDT**!`
                    )
                ]
            });
        } else {
            return await interaction.editReply({
                content: '⚠️ Auto-log completed or no deal log channel configured.'
            });
        }
    }
};

export default [
    buyUsdtButtonHandler,
    sellUsdtButtonHandler,
    autoLogTicketButtonHandler
];
