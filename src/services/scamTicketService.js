// scamTicketService.js
import {
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { getTicketData, setInDb, getFromDb } from '../utils/database.js';
import { getKycStatus } from './kycService.js';
import { logger } from '../utils/logger.js';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Resolves or auto-creates the restricted #scam-tickets channel.
 */
export async function resolveScamTicketsChannel(guild) {
  if (!guild || !guild.channels) return null;

  try {
    const channels = await guild.channels.fetch().catch(() => null) || guild.channels.cache;

    // 1. Look for existing scam-tickets channel
    let scamChannel = channels.find(c =>
      c &&
      c.type === ChannelType.GuildText &&
      (c.name.toLowerCase() === 'scam-tickets' ||
       c.name.toLowerCase() === 'scam-ticket' ||
       c.name.toLowerCase().includes('scam-ticket') ||
       c.name.toLowerCase().includes('scam-log'))
    );

    if (scamChannel) {
      return scamChannel;
    }

    // 2. Auto-create #scam-tickets with restricted permissions
    logger.info(`Creating restricted #scam-tickets channel in guild ${guild.name} (${guild.id})`);

    const overwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: guild.client.user.id, // Bot
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    // Give view access to guild owner
    if (guild.ownerId) {
      overwrites.push({
        id: guild.ownerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    // Look for Admin/Staff/Mod roles to add view permissions
    const staffRoles = guild.roles.cache.filter(r =>
      r && (
        r.permissions.has(PermissionFlagsBits.Administrator) ||
        r.permissions.has(PermissionFlagsBits.ManageGuild) ||
        r.permissions.has(PermissionFlagsBits.ManageMessages) ||
        r.name.toLowerCase().includes('staff') ||
        r.name.toLowerCase().includes('admin') ||
        r.name.toLowerCase().includes('mod')
      )
    );

    staffRoles.forEach(role => {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    });

    // Find category if possible
    const parentCategory = channels.find(c =>
      c && c.type === ChannelType.GuildCategory && (
        c.name.toLowerCase().includes('staff') ||
        c.name.toLowerCase().includes('admin') ||
        c.name.toLowerCase().includes('log') ||
        c.name.toLowerCase().includes('mod')
      )
    );

    scamChannel = await guild.channels.create({
      name: 'scam-tickets',
      type: ChannelType.GuildText,
      parent: parentCategory?.id || null,
      permissionOverwrites: overwrites,
      topic: '🚨 Private Archive for Scammer Ticket Evidence, Chat Transcripts, and Payment Proofs',
    });

    return scamChannel;
  } catch (error) {
    logger.error('Failed to resolve or create #scam-tickets channel:', error);
    return null;
  }
}

/**
 * Fetches all messages from the ticket using pagination.
 */
export async function fetchAllTicketMessages(channel) {
  const allMessages = [];
  let before = undefined;

  try {
    while (true) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      });

      if (batch.size === 0) break;
      allMessages.push(...batch.values());
      before = batch.last()?.id;

      if (batch.size < 100) break;
    }

    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  } catch (error) {
    logger.error('Error fetching all ticket messages for scam archive:', error);
  }

  return allMessages;
}

/**
 * Downloads image attachments as Buffers to re-upload to Discord so links never expire.
 */
export async function collectImageAttachments(messages) {
  const attachments = [];
  let totalBytes = 0;
  const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB max payload
  const MAX_IMAGES = 10;

  for (const msg of messages) {
    if (!msg.attachments || msg.attachments.size === 0) continue;

    for (const att of msg.attachments.values()) {
      if (attachments.length >= MAX_IMAGES) break;

      const isImage = att.contentType?.startsWith('image/') ||
                      /\.(png|jpe?g|webp|gif)$/i.test(att.name || '');

      if (!isImage) continue;

      try {
        const response = await fetch(att.url);
        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (totalBytes + buffer.length > MAX_TOTAL_BYTES) {
          logger.warn(`Skipping attachment ${att.name}: Exceeds 20MB batch limit`);
          continue;
        }

        totalBytes += buffer.length;
        const cleanName = `proof_${attachments.length + 1}_${att.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        attachments.push({
          builder: new AttachmentBuilder(buffer, { name: cleanName }),
          name: cleanName,
          originalUrl: att.url,
          author: msg.author?.tag || msg.author?.username || 'Unknown',
          timestamp: new Date(msg.createdTimestamp).toISOString(),
        });
      } catch (err) {
        logger.warn(`Could not download attachment ${att.url}: ${err.message}`);
      }
    }

    if (attachments.length >= MAX_IMAGES) break;
  }

  return attachments;
}

/**
 * Generates clean plain-text chat transcript file (opens cleanly in Discord without HTML markup).
 */
export function generateTextTranscript({
  channel,
  messages,
  scammerUser,
  staffMember,
  reason,
  notes,
  kycStatus,
  collectedImages,
}) {
  const channelName = channel.name;
  const scammerTag = scammerUser?.tag || scammerUser?.username || 'Unknown';
  const scammerId = scammerUser?.id || 'N/A';
  const staffTag = staffMember?.user?.tag || staffMember?.tag || staffMember?.displayName || 'Staff';
  const kycText = kycStatus?.status === 'verified' ? 'Verified' : 'Unverified (No KYC)';
  const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

  let text = `======================================================================\n`;
  text += `🚨 ICN SCAM EVIDENCE DOSSIER - #${channelName}\n`;
  text += `======================================================================\n`;
  text += `Scammer User: ${scammerTag} (ID: ${scammerId})\n`;
  text += `KYC Status:   ${kycText}\n`;
  text += `Reported By:  ${staffTag}\n`;
  text += `Reported At:  ${dateStr} IST\n`;
  text += `Scam Reason:  ${reason || 'Scam Attempt'}\n`;
  if (notes) text += `Staff Notes:  ${notes}\n`;
  text += `Total Msgs:   ${messages.length}\n`;
  text += `Images Saved: ${collectedImages.length}\n`;
  text += `======================================================================\n\n`;
  text += `--- TICKET CHAT LOG ---\n\n`;

  for (const msg of messages) {
    const time = new Date(msg.createdTimestamp).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const author = msg.author?.tag || msg.author?.username || 'Unknown';
    const isScammer = msg.author?.id === scammerUser?.id ? ' [SCAMMER]' : '';
    const isBot = msg.author?.bot ? ' [BOT]' : '';

    let content = msg.content || '';
    if (!content && msg.embeds.length > 0) {
      const embedTitles = msg.embeds.map(e => e.title || e.description?.slice(0, 40) || 'Embed').join(', ');
      content = `[Embed: ${embedTitles}]`;
    }

    let attText = '';
    if (msg.attachments && msg.attachments.size > 0) {
      const names = Array.from(msg.attachments.values()).map(a => a.name).join(', ');
      attText = ` [Attachments: ${names}]`;
    }

    text += `[${time}] ${author}${isScammer}${isBot}: ${content}${attText}\n`;
  }

  return Buffer.from(text, 'utf8');
}

/**
 * Builds a dedicated in-Discord Embed displaying the actual conversation history
 * so staff/admin can read the entire discussion directly without opening any file.
 */
export function buildScamChatLogEmbed(messages, scammerUser) {
  const lines = [];

  for (const msg of messages) {
    const time = new Date(msg.createdTimestamp).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const isScammer = msg.author?.id === scammerUser?.id;
    const authorPrefix = isScammer
      ? `🔴 **${msg.author?.displayName || msg.author?.username}**`
      : (msg.author?.bot ? `🤖 *${msg.author?.username}*` : `🟢 **${msg.author?.displayName || msg.author?.username}**`);

    let content = msg.content ? msg.content.trim() : '';
    if (!content && msg.embeds.length > 0) {
      content = `*[Embed: ${msg.embeds[0].title || 'Ticket Embed'}]*`;
    }

    if (msg.attachments && msg.attachments.size > 0) {
      const attNames = Array.from(msg.attachments.values()).map(a => `🖼️ *[${a.name}]*`).join(' ');
      content = content ? `${content}\n> ↳ ${attNames}` : `> ↳ ${attNames}`;
    }

    if (content) {
      lines.push(`> \`[${time}]\` ${authorPrefix}: ${content}`);
    }
  }

  let fullChatText = lines.join('\n');
  if (fullChatText.length > 3900) {
    fullChatText = fullChatText.substring(0, 3850) + '\n\n*... [Full chat continued in attached text file]*';
  }

  const embed = new EmbedBuilder()
    .setTitle('💬 Ticket Conversation History')
    .setDescription(fullChatText || '*No text messages sent in this ticket.*')
    .setColor('#34495E')
    .setFooter({
      text: 'Complete conversation transcript is also attached as a clean text file below.',
    });

  return embed;
}

/**
 * Builds the rich scam report embed to post into #scam-tickets.
 */
export function buildScamReportEmbed({
  channel,
  scammerUser,
  staffMember,
  reason,
  notes,
  kycStatus,
  messageCount,
  imageCount,
}) {
  const scammerMention = scammerUser ? `<@${scammerUser.id}>` : '`Unknown`';
  const scammerId = scammerUser?.id || 'N/A';
  const scammerTag = scammerUser?.tag || scammerUser?.username || 'Unknown';
  const staffMention = staffMember ? `<@${staffMember.id}>` : '`Staff`';

  const kycStatusText = kycStatus?.status === 'verified'
    ? '🟢 **Verified**'
    : (kycStatus?.status === 'rejected' ? '🔴 **Rejected**' : '⚪ **Unverified (No KYC)**');

  let accountAge = 'Unknown';
  if (scammerUser?.createdAt) {
    const createdTimestamp = Math.floor(scammerUser.createdTimestamp / 1000);
    accountAge = `<t:${createdTimestamp}:R> (<t:${createdTimestamp}:D>)`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🚨 SCAM INCIDENT REPORT')
    .setDescription(
      `An active ticket has been flagged as a **SCAM ATTEMPT** and archived for evidence.\n` +
      `Admin/Owners can review the conversation below, verify uploaded receipts/proofs, and share awareness alerts in <#beware-of-scams>.`
    )
    .setColor('#E74C3C')
    .addFields(
      {
        name: '👤 Scammer Identity',
        value: `> **User:** ${scammerMention} (\`${scammerTag}\`)\n> **User ID:** \`${scammerId}\`\n> **Account Created:** ${accountAge}\n> **KYC Status:** ${kycStatusText}`,
        inline: false,
      },
      {
        name: '🛡️ Reported By',
        value: `> ${staffMention} (\`${staffMember?.user?.tag || staffMember?.displayName || staffMember?.id}\`)`,
        inline: true,
      },
      {
        name: '🎫 Ticket Details',
        value: `> **Channel:** \`#${channel.name}\`\n> **Messages:** \`${messageCount}\`\n> **Images Attached:** \`${imageCount}\``,
        inline: true,
      },
      {
        name: '📝 Scam Reason',
        value: `\`\`\`\n${reason || 'Suspicious scam activity detected'}\n\`\`\``,
        inline: false,
      }
    )
    .setTimestamp();

  if (notes && notes.trim() !== '') {
    embed.addFields({
      name: '📌 Staff Remarks / Notes',
      value: `\`\`\`\n${notes.trim()}\n\`\`\``,
      inline: false,
    });
  }

  if (scammerUser?.displayAvatarURL) {
    embed.setThumbnail(scammerUser.displayAvatarURL({ dynamic: true }));
  }

  embed.setFooter({
    text: `ICN Scam Defense Archive • Channel: ${channel.name}`,
  });

  return embed;
}

/**
 * Main function: Orchestrates scam evidence collection, uploads to #scam-tickets,
 * saves backup to Neon DB, and deletes the ticket safely.
 */
export async function logScamTicket(channel, staffMember, { reason, notes }) {
  const guild = channel.guild;
  if (!guild) return false;

  try {
    const ticketData = await getTicketData(guild.id, channel.id).catch(() => null);
    const scammerUserId = ticketData?.userId || null;

    // Fetch scammer user info
    let scammerUser = null;
    if (scammerUserId) {
      scammerUser = await guild.client.users.fetch(scammerUserId).catch(() => null);
    }

    // Fallback: If scammer not in ticketData, find first non-bot human
    if (!scammerUser) {
      const channelMessages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      if (channelMessages) {
        const human = channelMessages.find(m => !m.author.bot && m.author.id !== staffMember.id);
        if (human) {
          scammerUser = human.author;
        }
      }
    }

    // Get KYC Status if available
    const kycStatus = scammerUser ? await getKycStatus(guild.id, scammerUser.id).catch(() => null) : null;

    // 1. Fetch ALL messages using pagination loop
    const allMessages = await fetchAllTicketMessages(channel);

    // 2. Download all image proofs as fresh AttachmentBuilder buffers
    const collectedImages = await collectImageAttachments(allMessages);

    // 3. Generate clean text transcript file
    const textTranscriptBuffer = generateTextTranscript({
      channel,
      messages: allMessages,
      scammerUser,
      staffMember,
      reason,
      notes,
      kycStatus,
      collectedImages,
    });

    const transcriptAttachment = new AttachmentBuilder(textTranscriptBuffer, {
      name: `scam-chat-log-${channel.name}.txt`,
    });

    // 4. Resolve or create #scam-tickets
    const scamChannel = await resolveScamTicketsChannel(guild);

    if (scamChannel) {
      // Build Report Embed
      const reportEmbed = buildScamReportEmbed({
        channel,
        scammerUser,
        staffMember,
        reason,
        notes,
        kycStatus,
        messageCount: allMessages.length,
        imageCount: collectedImages.length,
      });

      // Build in-Discord Chat Conversation Embed
      const chatEmbed = buildScamChatLogEmbed(allMessages, scammerUser);

      // Prepare files array: Clean Text Transcript + Re-uploaded image proofs
      const filesToSend = [transcriptAttachment];
      for (const img of collectedImages) {
        filesToSend.push(img.builder);
      }

      await scamChannel.send({
        embeds: [reportEmbed, chatEmbed],
        files: filesToSend,
      });

      logger.info(`Successfully logged scam ticket #${channel.name} to #${scamChannel.name} with direct chat embed, ${collectedImages.length} images, and clean text transcript.`);
    } else {
      logger.error('Could not resolve or create #scam-tickets channel to log scam incident!');
    }

    // 5. Store permanent backup in Neon Database (temp_data table)
    const scamRecord = {
      scamId: `SCAM-${Date.now().toString(36).toUpperCase()}`,
      guildId: guild.id,
      channelId: channel.id,
      channelName: channel.name,
      scammerUserId: scammerUser?.id || null,
      scammerUserTag: scammerUser?.tag || scammerUser?.username || 'Unknown',
      staffUserId: staffMember.id,
      staffUserTag: staffMember.user?.tag || staffMember.displayName || staffMember.id,
      reason: reason || 'Scam Attempt',
      notes: notes || '',
      messageCount: allMessages.length,
      imageCount: collectedImages.length,
      timestamp: new Date().toISOString(),
      messagesSummary: allMessages.map(m => ({
        author: m.author?.tag || m.author?.username,
        authorId: m.author?.id,
        content: m.content,
        timestamp: m.createdAt,
      })),
    };

    const scamKey = `guild:${guild.id}:scam:ticket:${channel.id}`;
    await setInDb(scamKey, scamRecord).catch(err => logger.warn('Failed to save scam record to DB:', err.message));

    const allScamsKey = `guild:${guild.id}:scam:logs`;
    const existingScams = await getFromDb(allScamsKey, []).catch(() => []);
    const scamList = Array.isArray(existingScams) ? existingScams : [];
    scamList.push({
      scamId: scamRecord.scamId,
      channelName: channel.name,
      scammerUserId: scamRecord.scammerUserId,
      reason: scamRecord.reason,
      timestamp: scamRecord.timestamp,
    });
    await setInDb(allScamsKey, scamList).catch(() => null);

    return true;
  } catch (error) {
    logger.error('Error logging scam ticket:', error);
    return false;
  }
}
