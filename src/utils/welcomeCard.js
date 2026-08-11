import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from './logger.js';

const FONTS_DIR = path.resolve('src/assets/fonts');

/**
 * Downloads and registers Inter fonts locally to prevent font rendering issues on Linux/Docker servers.
 */
async function ensureFonts() {
    try {
        if (!fs.existsSync(FONTS_DIR)) {
            fs.mkdirSync(FONTS_DIR, { recursive: true });
        }

        const boldPath = path.join(FONTS_DIR, 'Poppins-Bold.ttf');
        const mediumPath = path.join(FONTS_DIR, 'Poppins-Medium.ttf');

        if (!fs.existsSync(boldPath)) {
            logger.info('Downloading Poppins-Bold.ttf for welcome card...');
            const res = await axios.get('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Bold.ttf', { 
                responseType: 'arraybuffer',
                timeout: 10000
            });
            fs.writeFileSync(boldPath, Buffer.from(res.data));
            logger.info('Successfully downloaded Poppins-Bold.ttf');
        }

        if (!fs.existsSync(mediumPath)) {
            logger.info('Downloading Poppins-Medium.ttf for welcome card...');
            const res = await axios.get('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Medium.ttf', { 
                responseType: 'arraybuffer',
                timeout: 10000
            });
            fs.writeFileSync(mediumPath, Buffer.from(res.data));
            logger.info('Successfully downloaded Poppins-Medium.ttf');
        }

        // Register fonts dynamically
        if (GlobalFonts.has('PoppinsBold') === false) {
            GlobalFonts.registerFromPath(boldPath, 'PoppinsBold');
        }
        if (GlobalFonts.has('PoppinsMedium') === false) {
            GlobalFonts.registerFromPath(mediumPath, 'PoppinsMedium');
        }
    } catch (err) {
        logger.warn(`Could not setup custom welcome fonts: ${err.message}. Falling back to default sans-serif.`);
    }
}

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
    // Ensure custom premium fonts are registered first
    await ensureFonts().catch(() => null);

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
    
    // Choose font name (fallback if PoppinsBold was not registered)
    const fontBold = GlobalFonts.has('PoppinsBold') ? 'PoppinsBold' : 'sans-serif';
    const fontMedium = GlobalFonts.has('PoppinsMedium') ? 'PoppinsMedium' : 'sans-serif';

    ctx.font = `bold 16px ${fontBold}`;
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
        const response = await axios.get(avatarUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 5000
        });
        const avatarImage = await loadImage(Buffer.from(response.data));
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
    } catch (avatarErr) {
        logger.warn(`Failed to fetch avatar url via axios for welcome card: ${avatarErr.message}`);
        // Draw placeholder avatar
        ctx.save();
        ctx.fillStyle = '#2ECC71';
        ctx.beginPath();
        ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 48px ${fontBold}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(username.substring(0, 2).toUpperCase(), centerX, centerY);
        ctx.restore();
    }

    // 5. Draw Welcome Username text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 36px ${fontBold}`;
    ctx.fillText(`Welcome ${username}`, width / 2, 310);
    ctx.restore();

    // 6. Draw to Server Name text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#A0AABF';
    ctx.font = `18px ${fontMedium}`;
    ctx.fillText('to', width / 2, 345);
    
    ctx.fillStyle = '#2ECC71';
    ctx.font = `bold 28px ${fontBold}`;
    ctx.fillText(guildName.toUpperCase(), width / 2, 385);
    ctx.restore();

    // Convert canvas to Buffer and return AttachmentBuilder
    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `welcome-${username}.png` });
}
