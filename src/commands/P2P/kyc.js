import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getKycConfig, saveKycConfig, getKycStatus, startKycVerificationFlow, approveKyc, rejectKyc } from '../../services/kycService.js';
import { successEmbed, infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kyc')
        .setDescription('Identity (KYC) Verification Management System')
        .setDMPermission(false)

        // Subcommand: Configure KYC Setup
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configures KYC verified role, review category, and log channel.')
                .addRoleOption(option =>
                    option.setName('verified_role')
                        .setDescription('Role given to users after KYC approval')
                        .setRequired(false)
                )
                .addChannelOption(option =>
                    option.setName('review_category')
                        .setDescription('Category channel where KYC review tickets will be opened')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )
                .addChannelOption(option =>
                    option.setName('log_channel')
                        .setDescription('Channel where KYC action history will be logged')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )

        // Subcommand: Start KYC verification
        .addSubcommand(subcommand =>
            subcommand
                .setName('verify')
                .setDescription('Opens a private verification ticket to submit your ID and selfie.')
        )

        // Subcommand: View user status
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Checks the KYC verification status of a user.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check (defaults to you)')
                        .setRequired(false)
                )
        )

        // Subcommand: Manually approve KYC
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Manually approve verification status for a user.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to approve')
                        .setRequired(true)
                )
        )

        // Subcommand: Manually reject KYC
        .addSubcommand(subcommand =>
            subcommand
                .setName('reject')
                .setDescription('Manually reject verification status for a user.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to reject')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for rejection')
                        .setRequired(true)
                )
        )

        // Subcommand: Deploy interactive KYC Verification Panel
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Sends an interactive KYC Verification panel in a channel.')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Target channel (defaults to current channel)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Custom panel title')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Custom panel description')
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'verify') {
            // Users can start verification themselves
            return await startKycVerificationFlow(interaction, client);
        }

        // Administrative commands require ManageGuild or staff permissions
        if (subcommand === 'setup' || subcommand === 'approve' || subcommand === 'reject' || subcommand === 'panel') {
            const { getP2PConfig } = await import('../../services/p2pService.js');
            const p2pConfig = await getP2PConfig(interaction.guildId);

            const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
            const hasStaffRole = p2pConfig.staffRoleId && interaction.member
                ? (interaction.member.roles?.cache?.has ? interaction.member.roles.cache.has(p2pConfig.staffRoleId) : Array.isArray(interaction.member.roles) && interaction.member.roles.includes(p2pConfig.staffRoleId))
                : false;

            if (!hasManageGuild && !hasStaffRole && interaction.user.id !== interaction.guild.ownerId) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the `Manage Server` permission or Middleman/Staff role to run this administrative KYC command.'
                });
            }
        }

        await interaction.deferReply({ flags: subcommand === 'status' ? MessageFlags.Ephemeral : undefined });

        try {
            switch (subcommand) {
                case 'setup':
                    return await handleSetup(interaction);
                case 'status':
                    return await handleStatus(interaction);
                case 'approve':
                    return await handleApprove(interaction, client);
                case 'reject':
                    return await handleReject(interaction, client);
                case 'panel':
                    return await handlePanel(interaction);
            }
        } catch (err) {
            logger.error(`Error executing /kyc ${subcommand}:`, err);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('KYC Action Notice', err.userMessage || err.message || 'Operation failed.')]
            });
        }
    }
};

async function handleSetup(interaction) {
    const verifiedRole = interaction.options.getRole('verified_role');
    const reviewCategory = interaction.options.getChannel('review_category');
    const logChannel = interaction.options.getChannel('log_channel');

    const updateObj = {};
    if (verifiedRole) updateObj.roleId = verifiedRole.id;
    if (reviewCategory) updateObj.categoryId = reviewCategory.id;
    if (logChannel) updateObj.logChannelId = logChannel.id;

    if (Object.keys(updateObj).length === 0) {
        const currentConfig = await getKycConfig(interaction.guildId);
        const roleStr = currentConfig.roleId ? `<@&${currentConfig.roleId}>` : 'Not Set';
        const categoryStr = currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Not Set (Auto detect)';
        const logStr = currentConfig.logChannelId ? `<#${currentConfig.logChannelId}>` : 'Not Set';

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'KYC System Configuration',
                    `**Current Settings:**\n` +
                    `• **KYC Verified Role:** ${roleStr}\n` +
                    `• **KYC Review Category:** ${categoryStr}\n` +
                    `• **KYC Activity Log:** ${logStr}\n\n` +
                    `Use options in \`/kyc setup\` to update these settings.`
                )
            ]
        });
    }

    await saveKycConfig(interaction.guildId, updateObj);

    const changes = [];
    if (verifiedRole) changes.push(`• **KYC Verified Role:** <@&${verifiedRole.id}>`);
    if (reviewCategory) changes.push(`• **Review Category:** <#${reviewCategory.id}>`);
    if (logChannel) changes.push(`• **Activity Log Channel:** <#${logChannel.id}>`);

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'KYC Setup Updated',
                `Successfully updated KYC settings for this server:\n\n${changes.join('\n')}`
            )
        ]
    });
}

async function handleStatus(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const kycStatus = await getKycStatus(interaction.guildId, targetUser.id);

    let color = '#95A5A6'; // Grey
    let statusText = 'Not Started';

    if (kycStatus.status === 'pending') {
        color = '#FFC107'; // Amber
        statusText = '⏳ Pending Review';
    } else if (kycStatus.status === 'verified') {
        color = '#2ECC71'; // Green
        statusText = '✅ Verified';
    } else if (kycStatus.status === 'rejected') {
        color = '#E74C3C'; // Red
        statusText = '❌ Rejected';
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔒 KYC Verification Status`)
        .setDescription(`Showing identity verification status for <@${targetUser.id}>:`)
        .setColor(color)
        .addFields(
            { name: 'Status', value: `**${statusText}**`, inline: true },
            { name: 'User ID', value: `\`${targetUser.id}\``, inline: true }
        );

    if (kycStatus.status === 'rejected' && kycStatus.rejectionReason) {
        embed.addFields({ name: 'Rejection Reason', value: `\`${kycStatus.rejectionReason}\``, inline: false });
    }

    if (kycStatus.reviewedBy) {
        embed.addFields(
            { name: 'Reviewed By', value: `<@${kycStatus.reviewedBy}>`, inline: true },
            { name: 'Reviewed At', value: kycStatus.reviewedAt ? `<t:${Math.floor(new Date(kycStatus.reviewedAt).getTime() / 1000)}:R>` : 'N/A', inline: true }
        );
    }

    return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleApprove(interaction, client) {
    const targetUser = interaction.options.getUser('user');
    await approveKyc(interaction.guild, targetUser.id, interaction.member, client, interaction);
    return await InteractionHelper.safeEditReply(interaction, {
        content: `✅ Manually approved KYC status for <@${targetUser.id}>.`
    });
}

async function handleReject(interaction, client) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await rejectKyc(interaction.guild, targetUser.id, reason, interaction.member, client, interaction);
    return await InteractionHelper.safeEditReply(interaction, {
        content: `✅ Manually rejected KYC status for <@${targetUser.id}>. Reason: \`${reason}\``
    });
}

async function handlePanel(interaction) {
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const customTitle = interaction.options.getString('title') || '🔒 KYC Verification Required';
    const customDesc = interaction.options.getString('description') || 
        'To trade with KYC, buy with higher limits, or sell safely on this server, you must complete identity verification.\n\n' +
        '**Required Documents:**\n' +
        '1️⃣ Photo ID Document (Front & Back)\n' +
        '2️⃣ Selfie holding that Photo ID\n\n' +
        'Click the button below to open a private verification ticket.';

    const embed = new EmbedBuilder()
        .setTitle(customTitle)
        .setDescription(customDesc)
        .setColor('#FFC107')
        .setFooter({ text: `${interaction.guild.name} • KYC Portal` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('kyc_start_verification')
            .setLabel('🔒 Start Verification')
            .setStyle(ButtonStyle.Success)
    );

    await targetChannel.send({ embeds: [embed], components: [row] });

    return await InteractionHelper.safeEditReply(interaction, {
        content: `✅ Posted KYC verification panel in <#${targetChannel.id}>.`
    });
}
