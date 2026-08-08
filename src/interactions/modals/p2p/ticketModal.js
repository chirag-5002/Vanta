import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createTicket } from '../../../services/ticket.js';
import { getP2PConfig, getP2PPaymentConfig, buildBuyPaymentEmbed, buildSellPaymentEmbed } from '../../../services/p2pService.js';
import { logger } from '../../../utils/logger.js';
import { errorEmbed } from '../../../utils/embeds.js';

export const p2pWizardModalHandler = {
    name: 'p2p_wizard_modal',
    async execute(interaction, client, args) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const tradeType = args[0] || 'buy'; // 'buy' or 'sell'
            const kycType = args[1] || 'kyc';   // 'kyc' or 'nokyc'

            const isBuy = tradeType === 'buy';
            const isKyc = kycType === 'kyc';

            const config = await getP2PConfig(interaction.guildId);
            const paymentConfig = await getP2PPaymentConfig(interaction.guildId);

            let amountDisplay = '100';
            let paymentMethod = 'UPI';
            let networkLabel = 'USDT TRC20';
            let addressDisplay = 'N/A';

            if (isBuy) {
                // BUY FLOW:
                // 1. Amount
                // 2. Payment Method (UPI, IMPS, CDM, CCW)
                // 3. Network
                // 4. Wallet Address
                amountDisplay = interaction.fields.getTextInputValue('q1_amount') || '100';
                paymentMethod = (interaction.fields.getTextInputValue('q2_payment') || 'UPI').toUpperCase();
                networkLabel = (interaction.fields.getTextInputValue('q3_network') || 'USDT TRC20').toUpperCase();
                addressDisplay = interaction.fields.getTextInputValue('q4_address') || 'N/A';
            } else {
                // SELL FLOW:
                // 1. Amount
                // 2. Payment Method (UPI, IMPS)
                // 3. Payout Details (UPI/Bank)
                // 4. Network
                amountDisplay = interaction.fields.getTextInputValue('q1_amount') || '100';
                paymentMethod = (interaction.fields.getTextInputValue('q2_payment') || 'UPI').toUpperCase();
                addressDisplay = interaction.fields.getTextInputValue('q3_details') || 'N/A';
                networkLabel = (interaction.fields.getTextInputValue('q4_network') || 'USDT TRC20').toUpperCase();
            }

            const reason = `${isBuy ? 'Buy' : 'Sell'} ${amountDisplay} USDT via ${paymentMethod} (${networkLabel})`;

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
            const verificationTag = isKyc ? 'KYC Verified Deal' : 'Non-KYC Deal';

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
                    `> **1. Requested Amount:** \`${amountDisplay} USDT\``,
                    `> **2. Payment Method:** \`${paymentMethod}\``,
                    `> **3. Crypto Network:** \`${networkLabel}\``,
                    `> **4. Your Receiving Wallet Address:** \`${addressDisplay}\``,
                    `> **Verification:** \`${verificationTag}\``,
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
                    `> **1. Requested Amount:** \`${amountDisplay} USDT\``,
                    `> **2. Payout Method:** \`${paymentMethod}\``,
                    `> **3. Payout Details (UPI/Bank):** \`${addressDisplay}\``,
                    `> **4. Deposit Crypto Network:** \`${networkLabel}\``,
                    `> **Verification:** \`${verificationTag}\``,
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
                const paymentEmbed = buildBuyPaymentEmbed(paymentMethod, paymentConfig);
                await ticketChannel.send({ embeds: [paymentEmbed] });
            } else {
                const depositEmbed = buildSellPaymentEmbed(networkLabel, paymentConfig);
                await ticketChannel.send({ embeds: [depositEmbed] });
            }

            await interaction.editReply({
                content: `✅ Your **${isBuy ? 'Buy' : 'Sell'} USDT Ticket** has been created in <#${ticketChannel.id}>!`
            });

        } catch (err) {
            logger.error('Failed to create ticket from wizard modal:', err);
            const userMsg = err.userMessage || err.message || 'Please close existing open tickets before creating a new ticket.';
            await interaction.editReply({
                embeds: [
                    errorEmbed('Ticket Creation Notice', userMsg)
                ]
            }).catch(() => null);
        }
    }
};

export default p2pWizardModalHandler;
