import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import { logger } from './logger.js';
import { ensureFonts } from './welcomeCard.js';

/**
 * Generates a stunning celebratory milestone card.
 * 
 * @param {string|null} avatarUrl The avatar URL of the user who triggered the milestone
 * @param {string} username The username of the user who triggered it
 * @param {string} guildName The server's name
 * @param {string|null} guildIconUrl The server's icon URL
 * @param {number} milestone The milestone member count reached (e.g. 500)
 * @returns {Promise<AttachmentBuilder>} Discord attachment builder with PNG buffer
 */
export async function generateMilestoneCard(avatarUrl, username, guildName, guildIconUrl, milestone) {
    // Ensure standard premium Poppins fonts are available
    await ensureFonts().catch(() => null);

    const width = 1000;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const fontBold = GlobalFonts.has('PoppinsBold') ? 'PoppinsBold' : 'sans-serif';
    const fontMedium = GlobalFonts.has('PoppinsMedium') ? 'PoppinsMedium' : 'sans-serif';

    // 1. Draw modern premium background (dark sleek dark-gold gradient)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#060709'); // Dark void
    gradient.addColorStop(0.5, '#1A1405'); // Subtle gold/bronze void
    gradient.addColorStop(1, '#060709');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw radial glowing orbs in the corners
    ctx.save();
    // Top-left glowing gold orb
    let glowGrad = ctx.createRadialGradient(150, 150, 10, 150, 150, 300);
    glowGrad.addColorStop(0, 'rgba(241, 196, 15, 0.22)'); 
    glowGrad.addColorStop(1, 'rgba(241, 196, 15, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(150, 150, 300, 0, Math.PI * 2);
    ctx.fill();

    // Bottom-right glowing gold orb
    glowGrad = ctx.createRadialGradient(width - 150, height - 150, 10, width - 150, height - 150, 300);
    glowGrad.addColorStop(0, 'rgba(230, 126, 34, 0.18)'); 
    glowGrad.addColorStop(1, 'rgba(230, 126, 34, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(width - 150, height - 150, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw modern Card Frame with glowing golden border
    ctx.save();
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.15)';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.beginPath();
    ctx.roundRect(40, 40, width - 80, height - 80, 25);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Draw Confetti (festive shapes) scattered around the canvas
    ctx.save();
    const colors = ['#FFD700', '#FFA500', '#FFFFFF', '#FFDF00', '#ECE9E6'];
    for (let i = 0; i < 40; i++) {
        const cx = Math.random() * (width - 100) + 50;
        const cy = Math.random() * (height - 100) + 50;
        const size = Math.random() * 8 + 4;
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.beginPath();
        if (i % 3 === 0) {
            // Draw Star / Triangle
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx + size, cy + size);
            ctx.lineTo(cx - size, cy + size);
            ctx.closePath();
        } else if (i % 3 === 1) {
            // Draw Circle
            ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        } else {
            // Draw Rectangle
            ctx.rect(cx - size / 2, cy - size / 2, size, size * 1.5);
        }
        ctx.fill();
    }
    ctx.restore();

    // 4. Draw Server Icon on the Left with Golden glowing frame
    const iconSize = 140;
    const iconX = 120;
    const iconY = (height - iconSize) / 2;
    const iconCenterX = iconX + iconSize / 2;
    const iconCenterY = iconY + iconSize / 2;

    ctx.save();
    ctx.shadowColor = '#F1C40F';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#F1C40F';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(iconCenterX, iconCenterY, (iconSize / 2) + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (guildIconUrl) {
        try {
            const res = await axios.get(guildIconUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const guildImg = await loadImage(Buffer.from(res.data));
            ctx.save();
            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, iconSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(guildImg, iconX, iconY, iconSize, iconSize);
            ctx.restore();
        } catch (err) {
            logger.warn(`Failed to fetch guild icon for milestone card: ${err.message}`);
            // Fallback text icon
            drawFallbackCircle(ctx, iconCenterX, iconCenterY, iconSize / 2, guildName.substring(0, 2).toUpperCase(), fontBold);
        }
    } else {
        drawFallbackCircle(ctx, iconCenterX, iconCenterY, iconSize / 2, guildName.substring(0, 2).toUpperCase(), fontBold);
    }

    // 5. Draw Triggering User Avatar on the Right with glowing gold/orange frame
    const avatarSize = 140;
    const avatarX = width - 120 - avatarSize;
    const avatarY = (height - avatarSize) / 2;
    const avatarCenterX = avatarX + avatarSize / 2;
    const avatarCenterY = avatarY + avatarSize / 2;

    ctx.save();
    ctx.shadowColor = '#E67E22';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#E67E22';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, (avatarSize / 2) + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (avatarUrl) {
        try {
            const res = await axios.get(avatarUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const avatarImg = await loadImage(Buffer.from(res.data));
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } catch (err) {
            logger.warn(`Failed to fetch user avatar for milestone card: ${err.message}`);
            drawFallbackCircle(ctx, avatarCenterX, avatarCenterY, avatarSize / 2, username.substring(0, 2).toUpperCase(), fontBold, '#E67E22');
        }
    } else {
        drawFallbackCircle(ctx, avatarCenterX, avatarCenterY, avatarSize / 2, username.substring(0, 2).toUpperCase(), fontBold, '#E67E22');
    }

    // 6. Draw central milestone text
    const textCenterX = width / 2;

    // Subtitle "MILESTONE ACHIEVED"
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1C40F';
    ctx.font = `bold 24px ${fontBold}`;
    ctx.shadowColor = '#F1C40F';
    ctx.shadowBlur = 10;
    ctx.fillText('MILESTONE ACHIEVED', textCenterX, 140);
    ctx.restore();

    // Large glowing Milestone Number
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 60px ${fontBold}`;
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 15;
    ctx.fillText(`${milestone.toLocaleString()}`, textCenterX, 220);
    ctx.restore();

    // Text "MEMBERS"
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#A0AABF';
    ctx.font = `bold 28px ${fontBold}`;
    ctx.fillText('MEMBERS', textCenterX, 265);
    ctx.restore();

    // Special acknowledgment text at bottom
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `italic 18px ${fontMedium}`;
    ctx.fillText(`Triggered by: @${username}`, textCenterX, 340);

    ctx.fillStyle = '#A0AABF';
    ctx.font = `14px ${fontMedium}`;
    ctx.fillText(`Thank you for being our milestone member!`, textCenterX, 370);
    ctx.restore();

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `milestone-${milestone}.png` });
}

function drawFallbackCircle(ctx, x, y, radius, text, font, color = '#F1C40F') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 32px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
}
