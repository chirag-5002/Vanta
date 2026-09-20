import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from './logger.js';

const FONTS_DIR = path.resolve('src/assets/fonts');
const TEMPLATE_PATH = path.resolve('src/assets/transaction_certificate_clean.png');

/**
 * Ensures all required fonts for the certificate are downloaded and registered.
 */
export async function ensureCertificateFonts() {
    try {
        if (!fs.existsSync(FONTS_DIR)) {
            fs.mkdirSync(FONTS_DIR, { recursive: true });
        }

        const fonts = [
            {
                name: 'KaushanScript-Regular.ttf',
                family: 'KaushanScript',
                url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/kaushanscript/KaushanScript-Regular.ttf'
            },
            {
                name: 'Poppins-Bold.ttf',
                family: 'PoppinsBold',
                url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Bold.ttf'
            },
            {
                name: 'Poppins-Medium.ttf',
                family: 'PoppinsMedium',
                url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Medium.ttf'
            }
        ];

        for (const font of fonts) {
            const fontPath = path.join(FONTS_DIR, font.name);
            if (!fs.existsSync(fontPath)) {
                try {
                    logger.info(`Downloading ${font.name} for certificate...`);
                    const res = await axios.get(font.url, { responseType: 'arraybuffer', timeout: 10000 });
                    fs.writeFileSync(fontPath, Buffer.from(res.data));
                } catch (e) {
                    logger.warn(`Failed downloading font ${font.name}:`, e.message);
                }
            }

            if (fs.existsSync(fontPath) && !GlobalFonts.has(font.family)) {
                GlobalFonts.registerFromPath(fontPath, font.family);
            }
        }
    } catch (err) {
        logger.warn('Failed setting up custom certificate fonts:', err.message);
    }
}

/**
 * Formats a Date object or ISO string into "DD MONTH YYYY" uppercase format.
 * Example: "20 SEPTEMBER 2026"
 */
export function formatCertificateDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const day = d.getDate();
    const months = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    const month = months[d.getMonth()] || 'SEPTEMBER';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

/**
 * Formats amount into clean USDT display string (e.g. "$500 USDT" or "$1,250 USDT")
 */
export function formatCertificateAmount(amount) {
    const num = parseFloat(amount) || 0;
    const formatted = num.toLocaleString('en-US', {
        minimumFractionDigits: num % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    });
    return `$${formatted} USDT`;
}

/**
 * Generates the authentic ICN Transaction Achievement Award Certificate.
 * 
 * @param {Object} options
 * @param {string} options.traderName - Display name / username of the trader
 * @param {number|string} options.amount - USDT transaction volume
 * @param {Date|string} [options.date] - Transaction timestamp
 * @param {string} [options.dealId] - Unique Deal ID for verification
 * @param {string} [options.guildName] - Guild name
 * @returns {Promise<AttachmentBuilder|null>} Discord attachment with image/png
 */
export async function generateTransactionCertificate({
    traderName = 'Valued Trader',
    amount = 500,
    date = new Date(),
    dealId = 'ICN-TX-VERIFIED',
    guildName = 'ICN Network'
}) {
    try {
        await ensureCertificateFonts().catch(() => null);

        if (!fs.existsSync(TEMPLATE_PATH)) {
            logger.error(`Certificate template image not found at ${TEMPLATE_PATH}`);
            return null;
        }

        const baseImg = await loadImage(TEMPLATE_PATH);
        const canvas = createCanvas(baseImg.width, baseImg.height);
        const ctx = canvas.getContext('2d');

        // Draw crystal base template
        ctx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);

        // Resolve font names
        const fontScript = GlobalFonts.has('KaushanScript') ? 'KaushanScript' : 'cursive';
        const fontBold = GlobalFonts.has('PoppinsBold') ? 'PoppinsBold' : 'sans-serif';

        // 1. Draw "PRESENTED TO" header
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 13px ${fontBold}`;
        ctx.fillStyle = '#0A2540';
        ctx.letterSpacing = '4px';
        ctx.fillText('PRESENTED TO', 512, 252);
        ctx.restore();

        // 2. Clean & Sanitize Trader Name
        let cleanName = (traderName || 'Trader').trim();
        if (cleanName.length > 25) {
            cleanName = cleanName.substring(0, 23) + '...';
        }

        // Draw Recipient Name (Dynamic font sizing based on length)
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let fontSize = 52;
        ctx.font = `italic ${fontSize}px ${fontScript}`;
        let textMetrics = ctx.measureText(cleanName);
        while (textMetrics.width > 340 && fontSize > 22) {
            fontSize -= 2;
            ctx.font = `italic ${fontSize}px ${fontScript}`;
            textMetrics = ctx.measureText(cleanName);
        }

        // Deep navy blue text with soft glass shadow
        ctx.fillStyle = '#0B2C4E';
        ctx.shadowColor = 'rgba(11, 44, 78, 0.22)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(cleanName, 512, 292);

        // Electric Blue Underline Brush Swoosh
        const textWidth = textMetrics.width;
        const startX = 512 - textWidth / 2 - 8;
        const endX = 512 + textWidth / 2 + 18;
        const lineY = 322;

        const swooshGrad = ctx.createLinearGradient(startX, lineY, endX, lineY);
        swooshGrad.addColorStop(0, 'rgba(0, 153, 255, 0.1)');
        swooshGrad.addColorStop(0.2, '#00A3FF');
        swooshGrad.addColorStop(0.8, '#0077EE');
        swooshGrad.addColorStop(1, 'rgba(0, 119, 238, 0)');

        ctx.beginPath();
        ctx.moveTo(startX, lineY + 3);
        ctx.quadraticCurveTo(512, lineY - 4, endX, lineY - 6);
        ctx.strokeStyle = swooshGrad;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // 3. Draw USDT Volume inside glowing bracket container
        const formattedAmount = formatCertificateAmount(amount);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 38px ${fontBold}`;
        ctx.fillStyle = '#06203D';
        ctx.shadowColor = 'rgba(6, 32, 61, 0.18)';
        ctx.shadowBlur = 5;
        ctx.fillText(formattedAmount, 512, 461);
        ctx.restore();

        // 4. Draw Date
        const formattedDate = formatCertificateDate(date);
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 11px ${fontBold}`;
        ctx.fillStyle = '#1D3B5C';
        ctx.fillText(formattedDate, 120, 559);
        ctx.restore();

        // 5. Generate Privacy-Safe QR Code
        const qrPayload = [
            `ICN NETWORK • TRANSACTION CERTIFICATE`,
            `Status: VERIFIED AUTHENTIC`,
            `Certificate ID: ${dealId}`,
            `Volume: ${formattedAmount.replace('$', '')}`,
            `Date: ${formattedDate}`,
            `Trust • Trade • Grow`
        ].join('\n');

        const qrDataUrl = await qrcode.toDataURL(qrPayload, {
            margin: 0,
            color: {
                dark: '#0A2540',
                light: '#00000000' // transparent background
            },
            errorCorrectionLevel: 'M'
        });

        const qrImg = await loadImage(qrDataUrl);
        ctx.drawImage(qrImg, 843, 436, 82, 82);

        // Convert canvas to buffer
        const buffer = canvas.toBuffer('image/png');
        const filename = `icn-certificate-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'deal'}.png`;

        return new AttachmentBuilder(buffer, { name: filename });
    } catch (err) {
        logger.error('Failed generating transaction certificate card:', err);
        return null;
    }
}
