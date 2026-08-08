import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const p2pTradeButtonHandler = {
    name: 'p2p_trade_btn',
    async execute(interaction, client, args) {
        const tradeType = args[0] || 'buy'; // 'buy' or 'sell'
        const kycType = args[1] || 'kyc';   // 'kyc' or 'nokyc'

        const isBuy = tradeType === 'buy';
        const isKyc = kycType === 'kyc';

        const modal = new ModalBuilder()
            .setCustomId(`p2p_wizard_modal:${tradeType}:${kycType}`)
            .setTitle(`${isBuy ? '🛒 Buy USDT' : '🔴 Sell USDT'} (${isKyc ? 'KYC Verified' : 'Non-KYC'})`);

        if (isBuy) {
            // ==================== BUY MODAL (EXACT ORDER: 1. Amount -> 2. Payment Method -> 3. Network -> 4. Wallet Address) ====================
            
            // 1. Amount
            const q1Amount = new TextInputBuilder()
                .setCustomId('q1_amount')
                .setLabel('1. How much USDT do you want to BUY?')
                .setPlaceholder('e.g. 100, 500, or 2500')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 2. Payment Method
            const q2Payment = new TextInputBuilder()
                .setCustomId('q2_payment')
                .setLabel('2. Payment Method (UPI, IMPS, CDM, or CCW)')
                .setPlaceholder('Type: UPI / IMPS / CDM / CCW')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 3. Network
            const q3Network = new TextInputBuilder()
                .setCustomId('q3_network')
                .setLabel('3. Crypto Network (USDT TRC20, ERC20, BEP20, etc)')
                .setPlaceholder('Type: TRC20 / ERC20 / BEP20 / USDC')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 4. Wallet Address
            const q4Address = new TextInputBuilder()
                .setCustomId('q4_address')
                .setLabel('4. Your Receiving Wallet Address')
                .setPlaceholder('Enter your TRC20 / ERC20 Wallet Address')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1Amount),
                new ActionRowBuilder().addComponents(q2Payment),
                new ActionRowBuilder().addComponents(q3Network),
                new ActionRowBuilder().addComponents(q4Address)
            );

        } else {
            // ==================== SELL MODAL (EXACT ORDER: 1. Amount -> 2. Payment Method -> 3. Payout Details -> 4. Network) ====================
            
            // 1. Amount
            const q1Amount = new TextInputBuilder()
                .setCustomId('q1_amount')
                .setLabel('1. How much USDT do you want to SELL?')
                .setPlaceholder('e.g. 100, 500, or 2500')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 2. Payment Method
            const q2Payment = new TextInputBuilder()
                .setCustomId('q2_payment')
                .setLabel('2. Payout Method (UPI or IMPS)')
                .setPlaceholder('Type: UPI / IMPS')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // 3. Details
            const q3Details = new TextInputBuilder()
                .setCustomId('q3_details')
                .setLabel('3. Payout Details (UPI ID / Bank Acc & IFSC)')
                .setPlaceholder('Enter your UPI ID or Bank Account Details')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            // 4. Network
            const q4Network = new TextInputBuilder()
                .setCustomId('q4_network')
                .setLabel('4. Deposit Crypto Network (TRC20, ERC20, BEP20)')
                .setPlaceholder('Type: TRC20 / ERC20 / BEP20 / USDC')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1Amount),
                new ActionRowBuilder().addComponents(q2Payment),
                new ActionRowBuilder().addComponents(q3Details),
                new ActionRowBuilder().addComponents(q4Network)
            );
        }

        await interaction.showModal(modal);
    }
};

export const buyPriceButtonHandler = {
    name: 'p2p_price_buy',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'kyc']);
    }
};

export const sellPriceButtonHandler = {
    name: 'p2p_price_sell',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'kyc']);
    }
};

export const buyKycButtonHandler = {
    name: 'p2p_trade_buy_kyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'kyc']);
    }
};

export const buyNoKycButtonHandler = {
    name: 'p2p_trade_buy_nokyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['buy', 'nokyc']);
    }
};

export const sellKycButtonHandler = {
    name: 'p2p_trade_sell_kyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'kyc']);
    }
};

export const sellNoKycButtonHandler = {
    name: 'p2p_trade_sell_nokyc',
    async execute(interaction, client, args) {
        return await p2pTradeButtonHandler.execute(interaction, client, ['sell', 'nokyc']);
    }
};

export default [
    buyPriceButtonHandler,
    sellPriceButtonHandler,
    buyKycButtonHandler,
    buyNoKycButtonHandler,
    sellKycButtonHandler,
    sellNoKycButtonHandler
];
