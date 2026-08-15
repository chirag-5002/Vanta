import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { join } from 'path';
import { logger } from './logger.js';
import { ensureFonts } from './welcomeCard.js';

/**
 * Generates a stunning celebratory milestone card using the user's exact template.
 * Preserves the original layout (gold ribbon, laurels, statue, features), only replacing the number.
 * 
 * @param {string|null} avatarUrl The avatar URL of the user who triggered the milestone (unused)
 * @param {string} username The username of the user who triggered it (unused)
 * @param {string} guildName The server's name (unused)
 * @param {string|null} guildIconUrl The server's icon URL (unused)
 * @param {number} milestone The milestone member count reached (e.g. 500)
 * @returns {Promise<AttachmentBuilder>} Discord attachment builder with PNG buffer
 */
export async function generateMilestoneCard(avatarUrl, username, guildName, guildIconUrl, milestone) {
    // Ensure Poppins fonts are available
    await ensureFonts().catch(() => null);

    const bgPath = join(process.cwd(), 'src/assets/milestone_bg.jpg');
    const bgImg = await loadImage(bgPath).catch(() => null);

    if (!bgImg) {
        logger.error('Failed to load milestone background template image.');
        return null;
    }

    const width = bgImg.width;
    const height = bgImg.height;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const fontBold = GlobalFonts.has('PoppinsBold') ? 'PoppinsBold' : 'sans-serif';

    // 1. Draw the exact original template image
    ctx.drawImage(bgImg, 0, 0, width, height);

    // 2. Cover up ONLY the number "200" from the template
    // The "200" sits exactly between X = 290 and X = 535, Y = 260 and Y = 405.
    ctx.save();
    ctx.fillStyle = '#060709';
    ctx.fillRect(290, 260, 245, 145);

    // Reconstruct soft gold backing glow in the center of the covered area
    const glow = ctx.createRadialGradient(412, 333, 10, 412, 333, 120);
    glow.addColorStop(0, 'rgba(245, 176, 65, 0.15)'); // Soft warm gold
    glow.addColorStop(1, 'rgba(6, 7, 9, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(412, 333, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Draw new milestone number (e.g., 500, 1000) in the exact same spot
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold 125px ${fontBold}`;
    
    // Premium gold gradient matching the template's gold numbers
    const textGrad = ctx.createLinearGradient(412, 268, 412, 399);
    textGrad.addColorStop(0, '#FFE082'); // Bright gold top
    textGrad.addColorStop(0.5, '#F5B041'); // Medium gold
    textGrad.addColorStop(1, '#9C640C'); // Dark bronze bottom
    
    ctx.fillStyle = textGrad;
    ctx.shadowColor = '#F5B041';
    ctx.shadowBlur = 20;
    
    // Draw centered milestone number
    ctx.fillText(`${milestone}`, 412, 385);
    ctx.restore();

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `milestone-${milestone}.png` });
}
