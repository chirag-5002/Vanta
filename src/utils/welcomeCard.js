import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { logger } from './logger.js';

/**
 * Generates a beautiful Sapphire-style welcome card image.
 * 
 * @param {string} avatarUrl User's avatar image URL
 * @param {string} username Username of the member
 * @param {string} guildName Name of the server
 * @param {number} memberCount Total count of members in the server
 * @returns {Promise<AttachmentBuilder>} Discord attachment builder with PNG buffer
 */
export async function generateWelcomeCard(avatarUrl, username, guildName, memberCount) {
    // Create canvas
    const width = 850;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Draw modern premium background (dark sleek void style)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0B0C10'); // Dark void
    gradient.addColorStop(0.5, '#1F2833'); // Steel grey
    gradient.addColorStop(1, '#0B0C10');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw some subtle modern radial glows in the corners
    ctx.save();
    // Top-left green/cyan glow
    let glowGrad = ctx.createRadialGradient(80, 80, 10, 80, 80, 220);
    glowGrad.addColorStop(0, 'rgba(46, 204, 113, 0.22)'); 
    glowGrad.addColorStop(1, 'rgba(46, 204, 113, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(80, 80, 220, 0, Math.PI * 2);
    ctx.fill();

    // Bottom-right amber glow
    glowGrad = ctx.createRadialGradient(width - 80, height - 80, 10, width - 80, height - 80, 220);
    glowGrad.addColorStop(0, 'rgba(255, 193, 7, 0.18)'); 
    glowGrad.addColorStop(1, 'rgba(255, 193, 7, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(width - 80, height - 80, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw card frame (rounded inner panel)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.roundRect(30, 30, width - 60, height - 60, 20);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Draw Member Badge capsule
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    const badgeText = `Member #${memberCount}`;
    ctx.font = 'bold 16px sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 30;
    const badgeH = 34;
    const badgeX = (width - badgeW) / 2;
    const badgeY = 60;
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 17);
    ctx.fill();
    
    // Member Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, width / 2, badgeY + badgeH / 2);
    ctx.restore();

    // 4. Draw Circular User Avatar with Glowing neon ring
    const avatarSize = 130;
    const avatarX = (width - avatarSize) / 2;
    const avatarY = 120;
    const centerX = width / 2;
    const centerY = avatarY + avatarSize / 2;

    // Glow ring
    ctx.save();
    ctx.shadowColor = '#2ECC71';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#2ECC71';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, (avatarSize / 2) + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Draw avatar image masked inside a circle
    try {
        const avatarImage = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
    } catch (avatarErr) {
        logger.warn(`Failed to load avatar url ${avatarUrl} for welcome card: ${avatarErr.message}`);
        // Draw placeholder avatar
        ctx.save();
        ctx.fillStyle = '#2ECC71';
        ctx.beginPath();
        ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(username.substring(0, 2).toUpperCase(), centerX, centerY);
        ctx.restore();
    }

    // 5. Draw Welcome Username text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`Welcome ${username}`, width / 2, 310);
    ctx.restore();

    // 6. Draw to Server Name text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#A0AABF';
    ctx.font = '18px sans-serif';
    ctx.fillText('to', width / 2, 345);
    
    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(guildName.toUpperCase(), width / 2, 385);
    ctx.restore();

    // Convert canvas to Buffer and return AttachmentBuilder
    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `welcome-${username}.png` });
}
