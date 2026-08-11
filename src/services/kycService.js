import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getFromDb, setInDb, saveTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { getP2PConfig } from './p2pService.js';

function generateRandomId(length = 7) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export const DEFAULT_KYC_CONFIG = {
    roleId: null,      // Role given to verified users
    categoryId: null,  // Category for KYC tickets
    logChannelId: null, // Log channel for KYC decisions
};

export const getKycConfigKey = (guildId) => `guild:${guildId}:kyc:config`;
export const getKycUserKey = (guildId, userId) => `guild:${guildId}:kyc:user:${userId}`;

export async function getKycConfig(guildId) {
    if (!guildId) return { ...DEFAULT_KYC_CONFIG };
    const key = getKycConfigKey(guildId);
    const data = await getFromDb(key, {});
    return { ...DEFAULT_KYC_CONFIG, ...data };
}

export async function saveKycConfig(guildId, newConfig) {
    if (!guildId) return;
    const current = await getKycConfig(guildId);
    const updated = { ...current, ...newConfig };
    const key = getKycConfigKey(guildId);
    await setInDb(key, updated);
    return updated;
}

export async function getKycStatus(guildId, userId) {
    if (!guildId || !userId) return { status: 'none', userId, guildId };
    const key = getKycUserKey(guildId, userId);
    const data = await getFromDb(key, {});
    return { status: 'none', userId, guildId, ...data };
}

export async function saveKycStatus(guildId, userId, newStatus) {
    if (!guildId || !userId) return;
    const current = await getKycStatus(guildId, userId);
    const updated = { ...current, ...newStatus };
    const key = getKycUserKey(guildId, userId);
    await setInDb(key, updated);
    return updated;
}

export async function isUserKycVerified(guildId, userId) {
    const statusObj = await getKycStatus(guildId, userId);
    return statusObj.status === 'verified';
}

export async function startKycVerificationFlow(interaction, client) {
    const guild = interaction.guild;
    const member = interaction.member;
    const userId = member.id;

    // Check if channel already exists (any KYC channel where this user has ViewChannel overwrite)
    const existingChannel = guild.channels.cache.find(c => 
        c && c.type === ChannelType.GuildText &&
        (c.name.startsWith('kyc-') || c.name.startsWith('🔒-kyc-')) &&
        c.permissionOverwrites.cache.has(userId)
    );

    if (existingChannel) {
        const replyPayload = {
            content: `⚠️ You already have an active KYC verification ticket: <#${existingChannel.id}>`,
            flags: MessageFlags.Ephemeral
        };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(replyPayload);
        } else {
            await interaction.reply(replyPayload);
        }
        return;
    }

    const isDeferredOrReplied = interaction.deferred || interaction.replied;
    if (!isDeferredOrReplied) {
        await interaction.reply({
            content: `⌛ Creating your KYC verification ticket...`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Get KYC Config
    const config = await getKycConfig(guild.id);
    const categoryId = config.categoryId;
    
    // Find parent category
    let category = categoryId ? guild.channels.cache.get(categoryId) : null;
    if (!category) {
        // Prioritize KYC or Verification categories first
        category = guild.channels.cache.find(c =>
            c && c.type === ChannelType.GuildCategory &&
            (c.name.toLowerCase().includes('kyc') ||
             c.name.toLowerCase().includes('verify') ||
             c.name.toLowerCase().includes('verification'))
        );
    }
    if (!category) {
        // Fallback to general ticket categories
        category = guild.channels.cache.find(c =>
            c && c.type === ChannelType.GuildCategory &&
            c.name.toLowerCase().includes('ticket')
        );
    }
    if (!category && !categoryId) {
        // Auto-create category if none found
        category = await guild.channels.create({
            name: 'KYC Verification',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                }
            ]
        }).catch(() => null);
    }

    // Get P2P config for staff roles
    const p2pConfig = await getP2PConfig(guild.id);
    const staffRoleId = p2pConfig.staffRoleId;

    const ticketId = generateRandomId(7);

    // Create private ticket channel
    const channel = await guild.channels.create({
        name: `🔒-kyc-${ticketId}`,
        type: ChannelType.GuildText,
        parent: category?.id || null,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
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
            },
            ...(staffRoleId ? [{
                id: staffRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }] : [])
        ]
    });

    // Save ticket metadata in database so standard ticket actions can close it if needed
    const ticketData = {
        id: channel.id,
        userId: userId,
        guildId: guild.id,
        createdAt: new Date().toISOString(),
        status: 'open',
        claimedBy: null,
        priority: 'none',
        reason: 'KYC Verification'
    };
    await saveTicketData(guild.id, channel.id, ticketData);

    // Send welcome instructions
    const welcomeEmbed = new EmbedBuilder()
        .setTitle('🔒 KYC Verification Portal')
        .setDescription(
            `Welcome <@${userId}>! To verify your identity and unlock KYC trading, please upload:\n\n` +
            `1️⃣ **ID Card Photo** (Front & Back)\n` +
            `2️⃣ **Selfie** of you holding that ID Card\n\n` +
            `**Instructions:**\n` +
            `• Drag & drop or upload both image files directly in this channel.\n` +
            `• Once both files are visible in the chat, click **Submit Verification** below.`
        )
        .setColor('#FFC107')
        .setFooter({ text: `${guild.name} • KYC Verification System` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`kyc_ticket_submit:${userId}`)
            .setLabel('📤 Submit Verification')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`ticket_close`) // Reuse existing ticket close button
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `<@${userId}>`,
        embeds: [welcomeEmbed],
        components: [row]
    });

    const successMessage = `✅ Your KYC Verification ticket has been created: <#${channel.id}>`;
    if (isDeferredOrReplied) {
        await interaction.followUp({ content: successMessage, flags: MessageFlags.Ephemeral });
    } else {
        await interaction.editReply({ content: successMessage });
    }
}

export async function submitKycVerification(interaction, client, targetUserId) {
    const userId = targetUserId || interaction.user.id;
    const channel = interaction.channel;

    // Check if user is the one submitting (or if they are allowed to submit)
    if (interaction.user.id !== userId) {
        return await interaction.reply({
            content: '❌ Only the ticket creator can submit their verification documents.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Fetch last 15 messages in the channel to scan for attachments
    const messages = await channel.messages.fetch({ limit: 15 });
    const attachments = [];

    for (const msg of messages.values()) {
        if (msg.author.id === userId && msg.attachments.size > 0) {
            for (const attach of msg.attachments.values()) {
                const isImage = attach.contentType?.startsWith('image/') || 
                                attach.url.match(/\.(jpeg|jpg|png|webp|gif)/i);
                if (isImage) {
                    attachments.push(attach.url);
                }
            }
        }
    }

    if (attachments.length < 2) {
        return await interaction.editReply({
            content: `⚠️ **Submission Failed:** I found ${attachments.length} image(s). Please upload at least **2 separate images** in this channel:\n1. Your ID photo (front/back)\n2. A selfie holding that ID\nThen try submitting again.`
        });
    }

    // Save status
    const kycStatus = {
        status: 'pending',
        idPhotoUrl: attachments[0],
        selfieUrl: attachments[1],
        submittedAt: new Date().toISOString()
    };
    await saveKycStatus(interaction.guildId, userId, kycStatus);

    // Update the welcome message (disabled/removed buttons)
    try {
        const submittedEmbed = new EmbedBuilder()
            .setTitle('🔒 KYC Verification Submitted')
            .setDescription(
                `✅ Thank you! Your verification documents have been submitted.\n\n` +
                `• **Document 1:** [View Photo](${attachments[0]})\n` +
                `• **Document 2:** [View Photo](${attachments[1]})\n\n` +
                `*Support staff / admins will review your submission shortly.*`
            )
            .setColor('#FFC107')
            .setFooter({ text: 'Review Pending' });

        await interaction.message.edit({
            embeds: [submittedEmbed],
            components: []
        });
    } catch (err) {
        logger.error('Failed to edit welcome message on KYC submission:', err);
    }

    // Post review message for staff with thumbnails so images display as small boxes
    const staffEmbeds = [];
    const staffEmbed = new EmbedBuilder()
        .setTitle('👤 Staff Action Required: KYC Review')
        .setDescription(
            `Please review the KYC documents uploaded by <@${userId}>:\n\n` +
            attachments.map((url, index) => `• **Document ${index + 1}:** [View Photo](${url})`).join('\n')
        )
        .addFields(
            { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
            { name: 'Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setColor('#FFC107');

    if (attachments[0]) {
        staffEmbed.setThumbnail(attachments[0]); // Document 1 thumbnail
    }
    staffEmbeds.push(staffEmbed);

    // Add extra thumbnails for additional documents (renders as small boxes in a grid)
    for (let i = 1; i < attachments.length; i++) {
        const extraEmbed = new EmbedBuilder()
            .setColor('#FFC107')
            .setThumbnail(attachments[i]);
        staffEmbeds.push(extraEmbed);
    }

    const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`kyc_staff_approve:${userId}`)
            .setLabel('✅ Approve KYC')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`kyc_staff_reject:${userId}`)
            .setLabel('❌ Reject KYC')
            .setStyle(ButtonStyle.Danger)
    );

    const p2pConfig = await getP2PConfig(interaction.guildId);
    const staffMention = p2pConfig.staffRoleId ? `<@&${p2pConfig.staffRoleId}>` : '@here';

    await channel.send({
        content: `⚠️ **KYC Review Alert** for ${staffMention}`,
        embeds: staffEmbeds,
        components: [staffRow]
    });

    await interaction.editReply({
        content: '✅ Your KYC verification documents have been submitted to staff for review!'
    });
}

export async function approveKyc(guild, userId, staffMember, client, interaction) {
    const kycStatus = await getKycStatus(guild.id, userId);
    kycStatus.status = 'verified';
    kycStatus.reviewedBy = staffMember.id;
    kycStatus.reviewedAt = new Date().toISOString();
    await saveKycStatus(guild.id, userId, kycStatus);

    const kycConfig = await getKycConfig(guild.id);
    let roleAssignedMessage = '';

    // Assign Role if configured
    if (kycConfig.roleId) {
        const role = guild.roles.cache.get(kycConfig.roleId);
        if (role) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                try {
                    await member.roles.add(kycConfig.roleId, `KYC Approved by ${staffMember.user.tag}`);
                    roleAssignedMessage = ` and assigned the <@&${kycConfig.roleId}> role`;
                } catch (err) {
                    logger.error(`Failed to assign KYC role to user ${userId}:`, err);
                    roleAssignedMessage = ` (Failed to assign <@&${kycConfig.roleId}> role due to hierarchy/permissions)`;
                }
            }
        }
    }

    // Update the message in the ticket to remove staff buttons
    if (interaction && interaction.message) {
        const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#2ECC71')
            .setTitle('👤 KYC Review - APPROVED')
            .addFields({ name: 'Approved By', value: `<@${staffMember.id}>`, inline: true });
        
        const updatedEmbeds = [approvedEmbed];
        for (let i = 1; i < interaction.message.embeds.length; i++) {
            updatedEmbeds.push(EmbedBuilder.from(interaction.message.embeds[i]));
        }
        
        if (interaction.isButton()) {
            await interaction.update({
                embeds: updatedEmbeds,
                components: []
            }).catch(() => null);
        } else {
            await interaction.message.edit({
                embeds: updatedEmbeds,
                components: []
            }).catch(() => null);
        }
    }

    // Send confirmation to the channel with direct trading buttons
    const successChannelEmbed = new EmbedBuilder()
        .setTitle('🎉 KYC Approved')
        .setDescription(
            `Congratulations <@${userId}>! Your KYC Verification has been **approved** by <@${staffMember.id}>${roleAssignedMessage}.\n\n` +
            `You can now start trading with KYC directly from this channel!\n` +
            `Use the buttons below to open a trade, or close this ticket if you are finished.`
        )
        .setColor('#2ECC71');

    const tradeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('p2p_trade_buy_kyc')
            .setLabel('🟢 Buy with KYC')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('p2p_trade_sell_kyc')
            .setLabel('🔴 Sell with KYC')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [successChannelEmbed], components: [tradeRow] }).catch(() => null);

    // Send DM notification
    const targetUser = await client.users.fetch(userId).catch(() => null);
    if (targetUser) {
        const dmEmbed = new EmbedBuilder()
            .setTitle('🔒 KYC Verification Approved')
            .setDescription(`Your identity verification request in **${guild.name}** has been approved. You can now use all KYC-restricted trade channels!`)
            .setColor('#2ECC71');
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    // Log decision if config log channel exists or auto-detect logging-channel-of-verify
    let logChannel = kycConfig.logChannelId ? guild.channels.cache.get(kycConfig.logChannelId) : null;
    if (!logChannel) {
        logChannel = guild.channels.cache.find(c =>
            c && c.type === ChannelType.GuildText &&
            (c.name.toLowerCase().includes('verify') || c.name.toLowerCase().includes('kyc')) &&
            c.name.toLowerCase().includes('log')
        );
    }
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle('🔒 KYC Verification Approved')
            .setDescription(
                `**User:** <@${userId}> (${userId})\n` +
                `**Action:** APPROVED\n` +
                `**Reviewed By:** <@${staffMember.id}>\n` +
                `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
            .setColor('#2ECC71')
            .setTimestamp();
        
        const attachments = kycStatus.attachments || [];
        
        await logChannel.send({ 
            embeds: [logEmbed],
            files: attachments 
        }).catch(async (err) => {
            logger.warn('Failed to send kyc log with attachments, sending embed only:', err.message);
            await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        });
    }
}

export async function rejectKyc(guild, userId, reason, staffMember, client, interaction) {
    const kycStatus = await getKycStatus(guild.id, userId);
    kycStatus.status = 'rejected';
    kycStatus.rejectionReason = reason;
    kycStatus.reviewedBy = staffMember.id;
    kycStatus.reviewedAt = new Date().toISOString();
    await saveKycStatus(guild.id, userId, kycStatus);

    const kycConfig = await getKycConfig(guild.id);

    // Remove Role if configured and user has it
    if (kycConfig.roleId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && member.roles.cache.has(kycConfig.roleId)) {
            try {
                await member.roles.remove(kycConfig.roleId, `KYC Revoked/Rejected by ${staffMember.user.tag}: ${reason}`);
            } catch (err) {
                logger.error(`Failed to remove KYC role from user ${userId}:`, err);
            }
        }
    }

    // Update staff review message
    if (interaction && interaction.isModalSubmit()) {
        // If interaction is the modal submit, we need to find the staff review message to edit it
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: 50 });
        const reviewMsg = messages.find(m => m.embeds.some(e => e.title?.includes('Staff Action Required: KYC Review')));
        if (reviewMsg) {
            const rejectedEmbed = EmbedBuilder.from(reviewMsg.embeds[0])
                .setColor('#E74C3C')
                .setTitle('👤 KYC Review - REJECTED')
                .addFields(
                    { name: 'Rejected By', value: `<@${staffMember.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                );
            
            const updatedEmbeds = [rejectedEmbed];
            for (let i = 1; i < reviewMsg.embeds.length; i++) {
                updatedEmbeds.push(EmbedBuilder.from(reviewMsg.embeds[i]));
            }
            
            await reviewMsg.edit({ embeds: updatedEmbeds, components: [] }).catch(() => null);
        }
    }

    // Send rejection message to channel
    const rejectChannelEmbed = new EmbedBuilder()
        .setTitle('❌ KYC Verification Rejected')
        .setDescription(
            `Sorry <@${userId}>, your KYC Verification has been rejected.\n\n` +
            `**Reason:** \`${reason}\`\n\n` +
            `Please re-upload correct documents and click **Re-Submit Verification** below.`
        )
        .setColor('#E74C3C');

    const resubmitRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`kyc_ticket_submit:${userId}`)
            .setLabel('📤 Re-Submit Verification')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`ticket_close`)
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [rejectChannelEmbed], components: [resubmitRow] }).catch(() => null);

    // Send DM notification
    const targetUser = await client.users.fetch(userId).catch(() => null);
    if (targetUser) {
        const dmEmbed = new EmbedBuilder()
            .setTitle('🔒 KYC Verification Rejected')
            .setDescription(`Your identity verification request in **${guild.name}** was rejected.\n\n**Reason:** ${reason}`)
            .setColor('#E74C3C');
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    // Log decision if config log channel exists or auto-detect logging-channel-of-verify
    let logChannel = kycConfig.logChannelId ? guild.channels.cache.get(kycConfig.logChannelId) : null;
    if (!logChannel) {
        logChannel = guild.channels.cache.find(c =>
            c && c.type === ChannelType.GuildText &&
            (c.name.toLowerCase().includes('verify') || c.name.toLowerCase().includes('kyc')) &&
            c.name.toLowerCase().includes('log')
        );
    }
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle('🔒 KYC Verification Rejected')
            .setDescription(
                `**User:** <@${userId}> (${userId})\n` +
                `**Action:** REJECTED\n` +
                `**Reviewed By:** <@${staffMember.id}>\n` +
                `**Reason:** ${reason}\n` +
                `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
            .setColor('#E74C3C')
            .setTimestamp();

        const attachments = kycStatus.attachments || [];

        await logChannel.send({ 
            embeds: [logEmbed],
            files: attachments 
        }).catch(async (err) => {
            logger.warn('Failed to send kyc log with attachments, sending embed only:', err.message);
            await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        });
    }
}
