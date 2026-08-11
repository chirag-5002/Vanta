import { generateWelcomeCard } from '../src/utils/welcomeCard.js';
import fs from 'fs';

async function test() {
    console.log('Testing welcome card generation...');
    try {
        const attachment = await generateWelcomeCard(
            'https://cdn.discordapp.com/embed/avatars/0.png',
            'kapster007',
            'Inner Circle Network',
            48
        );
        fs.writeFileSync('welcome-test.png', attachment.attachment);
        console.log('✅ Welcome card generated successfully and saved to welcome-test.png');
    } catch (err) {
        console.error('❌ Welcome card generation failed:', err);
    }
}

test();
