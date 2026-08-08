import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createTicket } from '../../../services/ticket.js';
import { getP2PConfig } from '../../../services/p2pService.js';
import { logger } from '../../../utils/logger.js';

export const p2pTradeModalHandler = {
    name: 'p2p_trade_modal',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy'; // 'buy' or 'sell'
        const amount = interaction.fields.getTextInputValue('amount');
        const payment = interaction.fields.getTextInputValue('payment');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const config = await getP2PConfig(interaction.guildId);
            const isBuy = tradeType === 'buy';

            const reason = `${isBuy ? 'Buy' : 'Sell'} USDT (${amount} USDT via ${payment})`;
            
            // Create dedicated ticket channel via Vanta ticket service
            const result = await createTicket(
                interaction.guild,
                interaction.member,
                null, // default category
                reason,
                'none'
            );

            const ticketChannel = result.channel;

            const title = isBuy ? '🛒 Buy USDT Trade Request' : '🔴 Sell USDT Trade Request';
            const color = isBuy ? '#2ECC71' : '#E74C3C';

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(
                    `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n\n` +
                    `> **Trader:** <@${interaction.user.id}>\n` +
                    `> **Trade Direction:** \`${isBuy ? 'BUY USDT' : 'SELL USDT'}\`\n` +
                    `> **Requested Amount:** \`${amount} USDT\`\n` +
                    `> **Payment Mode:** \`${payment}\`\n` +
                    `> **Security:** \`Auto-MM Protected Trade\``
                )
                .setColor(color)
                .setFooter({ text: 'Vanta P2P Trade System • Keep all chats inside this ticket' });

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
                content: `✅ Your **${isBuy ? 'Buy' : 'Sell'} USDT Ticket** has been created in <#${ticketChannel.id}>!`
            });

        } catch (err) {
            logger.error('Failed to create P2P trade ticket:', err);
            await interaction.editReply({
                content: `❌ Failed to create ticket: ${err.message || 'Please try again in a moment.'}`
            });
        }
    }
};

export default p2pTradeModalHandler;
