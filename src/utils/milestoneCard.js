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

    // 2. Cover up ONLY the number "200" from the template using a clipped ellipse
    // Bounded vertically to Y = 395 to prevent clipping into the golden ribbon "MEMBERS" (starts at Y=400)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(412, 330, 130, 65, 0, 0, Math.PI * 2);
    ctx.clip();

    // Fill with a smooth radial gradient that matches the background color and fades out at the edges
    const grad = ctx.createRadialGradient(412, 330, 10, 412, 330, 130);
    grad.addColorStop(0, '#060709');
    grad.addColorStop(0.8, '#060709');
    grad.addColorStop(1, 'rgba(6, 7, 9, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(250, 250, 320, 160);
    ctx.restore();

    // Reconstruct gold backing glow in the center of the covered area
    ctx.save();
    const glow = ctx.createRadialGradient(412, 330, 10, 412, 330, 100);
    glow.addColorStop(0, 'rgba(245, 176, 65, 0.12)'); // Soft gold glow
    glow.addColorStop(1, 'rgba(6, 7, 9, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(412, 330, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Draw new milestone number (e.g., 500, 1000) in the exact same spot (X=412, Y=330)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Use Georgia for beautiful serif digits matching the template
    ctx.font = 'bold 125px Georgia'; 
    
    // Create multi-stop diagonal metallic gold gradient matching the template's gold numbers
    const textGrad = ctx.createLinearGradient(412 - 90, 330 - 55, 412 + 90, 330 + 55);
    textGrad.addColorStop(0, '#FFE082');   // Bright gold top-left
    textGrad.addColorStop(0.2, '#FFE57F');
    textGrad.addColorStop(0.4, '#F5B041'); // Deep warm gold
    textGrad.addColorStop(0.65, '#FFE57F'); // Shiny highlight
    textGrad.addColorStop(0.85, '#D59F0F'); // Darker gold
    textGrad.addColorStop(1, '#8C5A03');   // Dark bronze bottom-right
    
    // 3D Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;
    
    ctx.fillStyle = textGrad;
    ctx.fillText(`${milestone}`, 412, 330);
    
    // 4. Draw golden outline/stroke for metallic bevel effect
    ctx.shadowColor = 'transparent'; // Remove shadow for outline
    ctx.strokeStyle = '#FFE082'; // Gold border
    ctx.lineWidth = 1.5;
    ctx.strokeText(`${milestone}`, 412, 330);
    
    ctx.restore();

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: `milestone-${milestone}.png` });
}
