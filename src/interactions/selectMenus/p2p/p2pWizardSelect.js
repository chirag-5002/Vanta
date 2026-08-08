import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createTicket } from '../../../services/ticket.js';
import { getP2PConfig, getP2PPaymentConfig, buildBuyPaymentEmbed, buildSellPaymentEmbed } from '../../../services/p2pService.js';
import { logger } from '../../../utils/logger.js';

// Export memory store for transient select menu state
export const wizardSelections = new Map();

export const selectPaymentHandler = {
    name: 'p2p_select_payment',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const paymentMethod = interaction.values[0];

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const existing = wizardSelections.get(key) || {};
        existing.paymentMethod = paymentMethod;
        existing.tradeType = existing.tradeType || tradeType;
        existing.kycType = existing.kycType || kycType;
        wizardSelections.set(key, existing);

        if (existing.network && existing.amount) {
            await finalizeTicketCreation(interaction, existing);
            wizardSelections.delete(key);
        } else {
            await interaction.update({
                content: `✅ **Payment Method Selected:** \`${paymentMethod}\`\n👉 Now please select your **Crypto Network** from the second dropdown below.`,
                embeds: interaction.message.embeds,
                components: interaction.message.components
            }).catch(() => null);
        }
    }
};

export const selectNetworkHandler = {
    name: 'p2p_select_network',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy';
        const kycType = args[1] || 'kyc';
        const network = interaction.values[0];

        const key = `${interaction.guildId}:${interaction.user.id}`;
        const existing = wizardSelections.get(key) || {};
        existing.network = network;
        existing.tradeType = existing.tradeType || tradeType;
        existing.kycType = existing.kycType || kycType;
        wizardSelections.set(key, existing);

        if (existing.paymentMethod && existing.amount) {
            await finalizeTicketCreation(interaction, existing);
            wizardSelections.delete(key);
        } else {
            await interaction.update({
                content: `✅ **Crypto Network Selected:** \`${network.replace('_', ' ')}\`\n👉 Now please select your **Payment Method** from the first dropdown below.`,
                embeds: interaction.message.embeds,
                components: interaction.message.components
            }).catch(() => null);
        }
    }
};

async function finalizeTicketCreation(interaction, data) {
    await interaction.update({
        content: `⏳ Creating your private 1-on-1 **${data.tradeType === 'buy' ? 'Buy USDT' : 'Sell USDT'} Ticket**... Please wait a moment.`,
        embeds: [],
        components: []
    }).catch(() => null);

    try {
        const isBuy = data.tradeType === 'buy';
        const isKyc = data.kycType === 'kyc';

        const config = await getP2PConfig(interaction.guildId);
        const paymentConfig = await getP2PPaymentConfig(interaction.guildId);

        const networkLabel = (data.network || 'USDT_TRC20').replace('_', ' ');
        const amountDisplay = data.amount || 'Pending';
        const addressDisplay = data.address || 'Shared in chat';

        const reason = `${isBuy ? 'Buy' : 'Sell'} ${amountDisplay} USDT via ${data.paymentMethod} (${networkLabel})`;

        // 1. Create Private Ticket Channel
        const result = await createTicket(
            interaction.guild,
            interaction.member,
            null,
            reason,
            'none'
        );

        const ticketChannel = result.channel;

        // 2. Strict Permissions Setup (Guild Owner, Admins/Staff, Ticket Creator, Bot ONLY)
        const staffRoleId = config.staffRoleId;
        const permissionOverlays = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: interaction.guild.ownerId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
            },
            {
                id: interaction.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
            },
            {
                id: interaction.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
            }
        ];

        if (staffRoleId && interaction.guild.roles.cache.has(staffRoleId)) {
            permissionOverlays.push({
                id: staffRoleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
            });
        }

        await ticketChannel.permissionOverwrites.set(permissionOverlays).catch(() => null);

        // 3. Build Ticket Welcome Summary Card with EXACT USER SPECIFIED ORDER FOR BUY vs SELL
        const title = isBuy 
            ? `🛒 Buy USDT Trade Request (${isKyc ? 'KYC Verified' : 'Non-KYC'})`
            : `🔴 Sell USDT Trade Request (${isKyc ? 'KYC Verified' : 'Non-KYC'})`;

        let cardDescription = '';

        if (isBuy) {
            // FOR BUY:
            // 1. amount
            // 2. payment method (upi, imps, cdm, CCW)
            // 3. network
            // 4. wallet address
            cardDescription = [
                `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n`,
                `> **Trader / Creator:** <@${interaction.user.id}>`,
                `> **Trade Direction:** \`BUY USDT\``,
                `> **1. Amount:** \`${amountDisplay} USDT\``,
                `> **2. Payment Method:** \`${data.paymentMethod}\``,
                `> **3. Network:** \`${networkLabel}\``,
                `> **4. Receiving Wallet Address:** \`${addressDisplay}\``,
                `> **Verification:** \`${isKyc ? 'KYC Verified Deal' : 'Non-KYC Deal'}\``,
                `> **Security:** \`Auto-MM Protected Trade\``
            ].join('\n');
        } else {
            // FOR SELL:
            // 1. amount
            // 2. payment method (UPI, IMPS)
            // 3. details (upi, imps details)
            // 4. network
            cardDescription = [
                `Welcome <@${interaction.user.id}>! A verified Middleman / Support staff will assist your trade shortly.\n`,
                `> **Trader / Creator:** <@${interaction.user.id}>`,
                `> **Trade Direction:** \`SELL USDT\``,
                `> **1. Amount:** \`${amountDisplay} USDT\``,
                `> **2. Payout Method:** \`${data.paymentMethod}\``,
                `> **3. Payout Details (UPI/Bank):** \`${addressDisplay}\``,
                `> **4. Deposit Network:** \`${networkLabel}\``,
                `> **Verification:** \`${isKyc ? 'KYC Verified Deal' : 'Non-KYC Deal'}\``,
                `> **Security:** \`Auto-MM Protected Trade\``
            ].join('\n');
        }

        const summaryEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(cardDescription)
            .setColor(isBuy ? '#2ECC71' : '#E74C3C')
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

        // Send summary embed
        await ticketChannel.send({
            content: `<@${interaction.user.id}> ${staffRoleId ? `<@&${staffRoleId}>` : ''}`,
            embeds: [summaryEmbed],
            components: [controlsRow]
        });

        // 4. Auto-dispatch Payment QR Code / Bank Details or Deposit Wallet
        if (isBuy) {
            const paymentEmbed = buildBuyPaymentEmbed(data.paymentMethod, paymentConfig);
            await ticketChannel.send({ embeds: [paymentEmbed] });
        } else {
            const depositEmbed = buildSellPaymentEmbed(data.network, paymentConfig);
            await ticketChannel.send({ embeds: [depositEmbed] });
        }

        await interaction.followUp({
            content: `✅ Your **${isBuy ? 'Buy' : 'Sell'} USDT Ticket** has been created in <#${ticketChannel.id}>!`,
            flags: MessageFlags.Ephemeral
        }).catch(() => null);

    } catch (err) {
        logger.error('Failed to finalize ticket creation wizard:', err);
        await interaction.followUp({
            content: `❌ Failed to create ticket: ${err.message}`,
            flags: MessageFlags.Ephemeral
        }).catch(() => null);
    }
}

export default [
    selectPaymentHandler,
    selectNetworkHandler
];
