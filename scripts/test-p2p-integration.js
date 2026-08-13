import { initializeDatabase } from '../src/utils/database.js';
import { saveP2PConfig, getP2PConfig, logDeal, getUserP2PStats, getGuildP2PStats, buildDealEmbed, buildDealComponents } from '../src/services/p2pService.js';
import p2pCommand from '../src/commands/P2P/p2p.js';
import { vouchButtonHandler, gotoVouchButtonHandler } from '../src/interactions/buttons/p2p/vouchButton.js';
import { vouchModalHandler } from '../src/interactions/modals/p2p/vouchModal.js';

async function runEndToEndVerification() {
    console.log('========================================================');
    console.log('🚀 RUNNING AUTOMATED FULL END-TO-END P2P SYSTEM TEST');
    console.log('========================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, testName) {
        totalTests++;
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passedTests++;
        } else {
            console.error(`❌ [FAIL] ${testName}`);
            throw new Error(`Test failed: ${testName}`);
        }
    }

    // Step 1: Database Initialization Check
    console.log('--- TEST 1: Database Storage Initialization ---');
    const dbInstance = await initializeDatabase();
    assert(dbInstance !== null, 'Database wrapper initialized successfully');

    // Step 2: Service Config Save & Get
    console.log('\n--- TEST 2: P2P Configuration Management ---');
    const mockGuildId = '112233445566778899';
    await saveP2PConfig(mockGuildId, {
        dealChannelId: '998877665544332211',
        vouchChannelId: '123456789123456789',
        staffRoleId: '555444333222111000',
        footerText: 'Test Auto-MM Deal'
    });

    const config = await getP2PConfig(mockGuildId);
    assert(config.dealChannelId === '998877665544332211', 'Deal channel ID saved & retrieved correctly');
    assert(config.vouchChannelId === '123456789123456789', 'Vouch channel ID saved & retrieved correctly');
    assert(config.footerText === 'Test Auto-MM Deal', 'Custom footer label saved & retrieved correctly');

    // Step 3: Deal Logging & User Stats
    console.log('\n--- TEST 3: Deal Logging & Analytics Pipeline ---');
    const dealRecord = await logDeal(mockGuildId, {
        buyerId: 'user_buyer_101',
        sellerId: 'user_seller_202',
        usdtAmount: 150.00,
        usdAmount: 150.00,
        txHash: '0x987654321fedcba012345678',
        dealInfo: '500x USDT P2P Transfer',
        status: 'Completed',
        loggedBy: 'admin_middleman_007'
    });

    assert(dealRecord.dealId.startsWith('DEAL-'), 'Deal ID generated with format DEAL-XXXX');
    assert(dealRecord.usdtAmount === 150.00, 'USDT amount correctly logged');

    const buyerStats = await getUserP2PStats(mockGuildId, 'user_buyer_101');
    assert(buyerStats.completedDeals === 1, 'Buyer completed deal count incremented');
    assert(buyerStats.totalUsdtVolume === 150.00, 'Buyer total volume updated');

    const guildStats = await getGuildP2PStats(mockGuildId);
    assert(guildStats.completedDeals === 1, 'Guild total completed deals count updated');
    assert(guildStats.totalUsdtVolume === 150.00, 'Guild total volume updated');

    // Step 4: Embed & UI Rendering
    console.log('\n--- TEST 4: UI Embed & ActionRow Components ---');
    const embed = buildDealEmbed(dealRecord, config);
    assert(embed.data.title === 'Successful Transaction', 'Embed title matches spec');
    assert(embed.data.description.includes('user_buyer_101'), 'Embed contains Buyer mention tag');
    assert(embed.data.description.includes('user_seller_202'), 'Embed contains Seller mention tag');
    assert(embed.data.description.includes('150 USDT'), 'Embed contains USDT amount display');
    assert(embed.data.footer.text.includes('Test Auto-MM Deal'), 'Embed footer matches server config');

    const components = buildDealComponents(config.vouchChannelId, dealRecord.dealId);
    assert(components.components.length === 1, 'ActionRow includes 1 interactive button');

    // Step 5: Slash Command Handler Simulation
    console.log('\n--- TEST 5: Slash Command Execution (/p2p deal) ---');
    let replySent = false;
    let sentPayload = null;

    const mockInteraction = {
        id: 'mock_interaction_12345',
        createdTimestamp: Date.now(),
        guildId: mockGuildId,
        channel: { 
            id: 'channel_ticket_123',
            send: async () => { return { id: 'msg_success_123' }; }
        },
        user: { id: 'admin_middleman_007', username: 'MiddlemanAdmin' },
        memberPermissions: { has: () => true },
        member: {
            permissions: { has: () => true },
            roles: { cache: new Map() }
        },
        guild: {
            channels: {
                cache: new Map([
                    ['998877665544332211', {
                        id: '998877665544332211',
                        send: async (payload) => {
                            sentPayload = payload;
                            return { id: 'msg_embed_999' };
                        }
                    }]
                ])
            }
        },
        options: {
            getSubcommand: () => 'deal',
            getUser: (name) => name === 'buyer' ? { id: 'user_buyer_101' } : { id: 'user_seller_202' },
            getNumber: (name) => name === 'usdt_amount' ? 75 : 75,
            getString: (name) => name === 'tx_hash' ? '0x27ce64efdbcd' : (name === 'deal_info' ? '3x mbk wallet' : null),
            getChannel: () => null
        },
        deferred: false,
        deferredFlags: null,
        replied: false,
        deferReply: async () => { mockInteraction.deferred = true; return true; },
        editReply: async (response) => {
            replySent = true;
            return response;
        }
    };

    await p2pCommand.execute(mockInteraction, {}, {});
    assert(replySent === true, 'Command executed and replied successfully');
    assert(sentPayload !== null, 'Public transaction embed was posted to target channel');

    // Step 6: Button Interaction Handler Simulation
    console.log('\n--- TEST 6: Button Interaction Handling (p2p_vouch_btn) ---');
    let modalShown = false;
    const mockButtonInteraction = {
        customId: `p2p_vouch_btn:${dealRecord.dealId}`,
        showModal: async (modalData) => {
            modalShown = modalData !== null;
        }
    };
    await vouchButtonHandler.execute(mockButtonInteraction, {}, [dealRecord.dealId]);
    assert(modalShown === true, 'Clicking Submit Vouch button triggers the Vouch Modal correctly');

    // Step 7: Modal Submission Handling
    console.log('\n--- TEST 7: Modal Submission Handling (p2p_vouch_modal) ---');
    let vouchReplySent = false;
    let vouchChannelMessageSent = false;

    const mockModalInteraction = {
        id: 'mock_modal_interaction_67890',
        createdTimestamp: Date.now(),
        guildId: mockGuildId,
        user: { id: 'user_buyer_101', username: 'BuyerUser' },
        guild: {
            channels: {
                cache: Object.assign(new Map([
                    ['123456789123456789', {
                        id: '123456789123456789',
                        name: 'feedback-comment',
                        type: 0, // GuildText
                        send: async (msg) => {
                            vouchChannelMessageSent = msg !== null;
                            return { id: 'vouch_msg_111' };
                        }
                    }]
                ]), {
                    find: function(fn) {
                        for (const val of this.values()) {
                            if (fn(val)) return val;
                        }
                        return null;
                    }
                }),
                fetch: async function() {
                    return this.cache;
                }
            }
        },
        fields: {
            getTextInputValue: (field) => field === 'rating' ? '5' : 'Extremely fast transfer! Highly recommended +rep'
        },
        deferred: false,
        deferReply: async () => { mockModalInteraction.deferred = true; return true; },
        editReply: async () => { vouchReplySent = true; }
    };

    await vouchModalHandler.execute(mockModalInteraction, {}, [dealRecord.dealId]);
    assert(vouchReplySent === true, 'Modal submission responded with success confirmation');
    assert(vouchChannelMessageSent === true, 'Verified Vouch embed was posted to the #gws-vouches channel');

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} INTEGRATION TESTS PASSED 100% SUCCESSFULLY!`);
    console.log('========================================================\n');
}

runEndToEndVerification().catch(err => {
    console.error('\n❌ INTEGRATION TEST ERROR:', err);
    process.exit(1);
});
