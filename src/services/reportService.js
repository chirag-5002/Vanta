import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';
import { saveTicketData } from '../utils/database.js';

/**
 * Auto-deploys the report instructions panel inside the #report-a-user channel.
 */
export async function autoDeployReportPanel(guild) {
    try {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) return;

        const reportChannel = channels.find(c =>
            c && c.type === ChannelType.GuildText &&
            c.name.toLowerCase().includes('report-a-user')
        );

        if (!reportChannel) return;

        // Fetch messages to check if the panel is already sent
        const messages = await reportChannel.messages.fetch({ limit: 15 }).catch(() => null);
        const hasPanel = messages && messages.some(m => 
            m.author.id === guild.client.user.id && 
            m.embeds.some(e => e.title && e.title.includes('Report a User'))
        );

        if (!hasPanel) {
            // Clear old bot messages
            if (messages) {
                const botMsgs = messages.filter(m => m.author.id === guild.client.user.id);
                for (const m of botMsgs.values()) {
                    await m.delete().catch(() => null);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('⚠️ ICN User Report System')
                .setDescription(
                    `Welcome to the **ICN User Report Portal**.\n\n` +
                    `If a member is breaking server rules, disturbing you, or attempting scams, please click the button below to submit a formal report.\n\n` +
                    `🛡️ **All reports are private and visible only to the server Mod/Admin team.**`
                )
                .setColor('#E74C3C')
                .setFooter({ text: 'ICN Moderation • Keeping the community safe' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('report_user_button')
                    .setLabel('⚠️ Report a User')
                    .setStyle(ButtonStyle.Danger)
            );

            await reportChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
        }
    } catch (err) {
        logger.error('Error auto-deploying report panel:', err);
    }
}

/**
 * Creates a private ticket for a user report under the category 'Report Tickets'.
 */
export async function createReportTicket(guild, reporter, targetUser, irritateCheck, details, client) {
    try {
        const channels = await guild.channels.fetch().catch(() => null);
        if (!channels) return null;

        // 1. Find or create the 'Report Tickets' category
        let category = channels.find(c => 
            c && c.type === ChannelType.GuildCategory && 
            (c.name.toLowerCase() === 'report tickets' || c.name.toLowerCase().includes('report ticket'))
        );

        if (!category) {
            category = await guild.channels.create({
                name: 'Report Tickets',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            }).catch(() => null);
        }

        // 2. Determine support/staff roles to grant access to the ticket
        const staffRoles = [];
        const guildRoles = await guild.roles.fetch().catch(() => null);
        if (guildRoles) {
            const adminModRoles = guildRoles.filter(role => 
                role.permissions.has(PermissionFlagsBits.Administrator) ||
                role.permissions.has(PermissionFlagsBits.ManageChannels) ||
                role.name.toLowerCase().includes('admin') ||
                role.name.toLowerCase().includes('mod') ||
                role.name.toLowerCase().includes('staff')
            );
            adminModRoles.forEach(r => staffRoles.push(r.id));
        }

        // 3. Create private ticket channel prefixed with 'ticket-report-' so it auto-deletes in 5 minutes after close
        const ticketNumber = Math.floor(1000 + Math.random() * 9000);
        const channelName = `ticket-report-${reporter.username.substring(0, 15)}-${ticketNumber}`;

        const permissionOverwrites = [
            {
                id: guild.id, // @everyone
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: reporter.id, // The reporter
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ];

        // Add staff roles to overwrites
        staffRoles.forEach(roleId => {
            permissionOverwrites.push({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels
                ]
            });
        });

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites
        });

        // 4. Save ticket metadata into standard ticket system database
        const ticketData = {
            id: ticketChannel.id,
            guildId: guild.id,
            creatorId: reporter.id,
            status: 'open',
            createdAt: new Date().toISOString(),
            reason: `User Report: Target ${targetUser}`,
            priority: 'high'
        };
        await saveTicketData(guild.id, ticketChannel.id, ticketData).catch(() => null);

        // 5. Send greeting panel inside the ticket channel
        const embed = new EmbedBuilder()
            .setTitle('⚠️ User Report Form Submitted')
            .setDescription(
                `👋 Welcome <@${reporter.id}> to your report ticket.\n` +
                `Our Moderation team will review the details below shortly. You may upload screenshots/evidence in this channel if needed.\n\n` +
                `**Report Details:**\n` +
                `• **Reported User:** \`${targetUser}\`\n` +
                `• **Disturbed/Irritated you?** \`${irritateCheck}\`\n` +
                `• **Details:** ${details}`
            )
            .setColor('#E74C3C')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
        await ticketChannel.send({ content: `👋 Welcome <@${reporter.id}>! Please post any proof or messages here.` }).catch(() => null);

        // 6. Log the report to #user-reports channel
        try {
            const logChannel = channels.find(c => 
                c && c.type === ChannelType.GuildText && 
                (c.name.toLowerCase() === 'user-reports' || c.name.toLowerCase().includes('user-reports'))
            );

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🚨 New User Report Submitted')
                    .setDescription(
                        `**Reporter:** <@${reporter.id}> (\`${reporter.id}\`)\n` +
                        `**Reported User:** \`${targetUser}\`\n` +
                        `**Disturbed/Irritated:** \`${irritateCheck}\`\n` +
                        `**Ticket Channel:** <#${ticketChannel.id}>\n\n` +
                        `**Incident Details:**\n${details}`
                    )
                    .setColor('#E74C3C')
                    .setFooter({ text: 'ICN Report System' })
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
            }
        } catch (logErr) {
            logger.error('Error sending report log to #user-reports:', logErr);
        }

        return ticketChannel;
    } catch (err) {
        logger.error('Error creating report ticket:', err);
        return null;
    }
}
