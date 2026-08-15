import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { join } from 'path';
import { logger } from './logger.js';
import { ensureFonts } from './welcomeCard.js';

/**
 * Generates a stunning celebratory milestone card using the user's exact template.
 * 
 * @param {string|null} avatarUrl The avatar URL of the user who triggered the milestone (unused in this design)
 * @param {string} username The username of the user who triggered it
 * @param {string} guildName The server's name (unused in this design)
 * @param {string|null} guildIconUrl The server's icon URL (unused in this design)
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
    const fontMedium = GlobalFonts.has('PoppinsMedium') ? 'PoppinsMedium' : 'sans-serif';

    // 1. Draw the exact original template image
    ctx.drawImage(bgImg, 0, 0, width, height);

    // 2. Draw a dark radial gradient cover-up over the central-left text area
    // The original text center is at X = 410, and spans Y = 250 to Y = 540.
    ctx.save();
    const grad = ctx.createRadialGradient(410, 390, 20, 410, 390, 220);
    grad.addColorStop(0, '#060709'); // Dark void matching the background
    grad.addColorStop(0.85, '#060709');
    grad.addColorStop(1, 'rgba(6, 7, 9, 0)'); // Fade out to blend
    ctx.fillStyle = grad;
    
    // Draw the cover-up circle
    ctx.beginPath();
    ctx.arc(410, 390, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Draw new milestone number (e.g., 500, 1000)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold 120px ${fontBold}`;
    
    // Premium gold gradient matching the theme
    const textGrad = ctx.createLinearGradient(410, 260, 410, 385);
    textGrad.addColorStop(0, '#FFE082');
    textGrad.addColorStop(0.5, '#F5B041');
    textGrad.addColorStop(1, '#9C640C');
    ctx.fillStyle = textGrad;
    ctx.shadowColor = '#F5B041';
    ctx.shadowBlur = 25;
    ctx.fillText(`${milestone.toLocaleString()}`, 410, 385);
    ctx.restore();

    // 4. Draw "MEMBERS" text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#CBB380'; // Gold/bronze matching "MEMBERS"
    ctx.font = `bold 28px ${fontBold}`;
    ctx.fillText('MEMBERS', 410, 425);
    ctx.restore();

    // 5. Draw "Milestone Achieved!" cursive text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `italic bold 24px ${fontMedium}`;
    ctx.fillText('Milestone Achieved!', 410, 465);
    ctx.restore();

    // 6. Draw "THANK YOU TO OUR AMAZING COMMUNITY..." text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9C9FA6';
    ctx.font = `bold 12px ${fontMedium}`;
    ctx.fillText('THANK YOU TO OUR AMAZING COMMUNITY', 410, 495);
    ctx.fillText('FOR YOUR TRUST AND SUPPORT.', 410, 515);
    
    // 7. Draw target achiever person thanks at the bottom of the text area
    ctx.fillStyle = '#FFE082'; // Gold thanks matching design
    ctx.font = `bold 13px ${fontMedium}`;
    ctx.fillText(`Special thanks to our milestone member: @${username}`, 410, 545);
    ctx.restore();

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `milestone-${milestone}.png` });
}
