import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { saveTicketData } from '../utils/database.js';

/**
 * Auto-deploys the support instructions panel inside the #support channel.
 */
export async function autoDeploySupportPanel(guild) {
    try {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) return;

        const supportChannel = channels.find(c =>
            c && c.type === ChannelType.GuildText &&
            c.name.toLowerCase().includes('support')
        );

        if (!supportChannel) return;

        // Fetch messages to see if default panel is already there
        const messages = await supportChannel.messages.fetch({ limit: 15 }).catch(() => null);
        const hasPanel = messages && messages.some(m => 
            m.author.id === guild.client.user.id && 
            m.embeds.some(e => e.title && e.title.includes('Support Portal'))
        );

        if (!hasPanel) {
            // Delete old bot messages if any
            if (messages) {
                const botMsgs = messages.filter(m => m.author.id === guild.client.user.id);
                for (const m of botMsgs.values()) {
                    await m.delete().catch(() => null);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🎫 ICN Support Portal')
                .setDescription(
                    `Welcome to the **ICN Support Portal**!\n\n` +
                    `To open a support ticket and talk to our Admins/Owners:\n` +
                    `✍️ **Type your query/question directly in this channel and press Enter.**\n\n` +
                    `*Once you send the message, a private ticket will be created for you, and your message here will be cleared automatically to maintain privacy.*`
                )
                .setColor('#FFC107')
                .setFooter({ text: 'ICN Support • Private & Secure Queries' });

            await supportChannel.send({ embeds: [embed] }).catch(() => null);
        }
    } catch (err) {
        logger.error('Error auto-deploying support panel:', err);
    }
}

/**
 * Creates a private ticket for a user query under the category named 'logging'.
 */
export async function createSupportQueryTicket(guild, member, query, client) {
    try {
        const user = member.user;
        
        // Find category named "logging" (case-insensitive) or create it if not exists
        const channels = await guild.channels.fetch().catch(() => null);
        let category = channels ? channels.find(c => 
            c && c.type === ChannelType.GuildCategory && 
            c.name.toLowerCase() === 'logging'
        ) : null;

        if (!category) {
            category = await guild.channels.create({
                name: 'logging',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            }).catch(() => null);
        }

        // Generate clean ticket ID
        const ticketId = Math.floor(1000 + Math.random() * 9000);
        
        // Create private ticket channel
        const channelName = `🔒-query-${ticketId}`;
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ]
        });

        // Register standard ticket data in database
        const ticketData = {
            id: ticketChannel.id,
            userId: user.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            status: 'open',
            claimedBy: null,
            priority: 'none',
            reason: `Support Query: ${query.substring(0, 100)}`
        };
        await saveTicketData(guild.id, ticketChannel.id, ticketData);

        // Build welcome query card
        const embed = new EmbedBuilder()
            .setTitle('🎫 New Support Query Opened')
            .setDescription(
                `Welcome <@${user.id}>! Your query has been logged and a support ticket is created.\n\n` +
                `**User:** <@${user.id}> (\`${user.id}\`)\n` +
                `**Submitted Query:**\n\`\`\`${query}\`\`\`\n` +
                `Our Admins/Owners will review and reply to your query here shortly.`
            )
            .setColor('#FFC107')
            .setFooter({ text: 'ICN Support System • Private Ticket' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
            content: `<@${user.id}>`,
            embeds: [embed],
            components: [row]
        });

        // Alert user via DM with a redirect link
        try {
            await user.send(`✅ Your support ticket has been created: <#${ticketChannel.id}>\n**Your query:** ${query}`).catch(() => null);
        } catch (_) {}

    } catch (err) {
        logger.error('Failed to create support query ticket:', err);
    }
}
