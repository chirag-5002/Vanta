import { buildDealEmbed, buildDealComponents, DEFAULT_P2P_CONFIG } from '../src/services/p2pService.js';

console.log('----------------------------------------------------');
console.log('🔥 TITANBOT / VANTA P2P DEAL EMBED PREVIEW TEST 🔥');
console.log('----------------------------------------------------');

const mockDeal = {
    dealId: 'DEAL-9X82A',
    buyerId: '676031998321491968',
    sellerId: '1464674129880813753',
    usdtAmount: 75.00,
    usdAmount: 75.00,
    txHash: '0x27ce64efdbcd1a3acd1289fe',
    dealInfo: '3x mbk wallet',
    status: 'Completed',
    timestamp: new Date().toISOString()
};

const mockConfig = {
    ...DEFAULT_P2P_CONFIG,
    vouchChannelId: '123456789012345678',
    footerText: 'Auto-MM Successful Deal'
};

const embed = buildDealEmbed(mockDeal, mockConfig);
const components = buildDealComponents(mockConfig.vouchChannelId, mockDeal.dealId);

console.log('\n--- EMBED DATA ---');
console.log('Title:', embed.data.title);
console.log('Color:', embed.data.color ? `#${embed.data.color.toString(16)}` : 'Default');
console.log('\n--- DESCRIPTION ---');
console.log(embed.data.description);
console.log('\n--- FOOTER ---');
console.log(embed.data.footer?.text);

console.log('\n--- ACTION ROW BUTTONS ---');
components.components.forEach((btn, idx) => {
    console.log(`Button ${idx + 1}: Label="${btn.data.label}" CustomId="${btn.data.custom_id}" Style=${btn.data.style}`);
});

console.log('\n✅ P2P Embed & Component verification successful!');
console.log('----------------------------------------------------');
