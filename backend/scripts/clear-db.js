"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const TABLES = [
    'SpendingRecord',
    'SessionKey',
    'AuditEvent',
    'RewardPoint',
    'Referral',
    'ReferralCode',
    'RampTransaction',
    'SmartWallet',
    'UserActivityLog',
    'UserInsightCache',
    'Notification',
    'Contact',
    'SocialNode',
    'VerificationCode',
    'PaymentRequest',
    'EnvelopeClaim',
    'RedEnvelope',
    'LoanApplication',
    'PoolMember',
    'GroupPool',
    'UserNotificationPreference',
    'NotificationLog',
    'AdminIdentifier',
    'Admin',
    'ShortLink',
    'PendingClaim',
    'GasRebate',
    'User',
];
async function main() {
    console.log('🗑️  Clearing database...\n');
    const cleared = [];
    const skipped = [];
    for (const table of TABLES) {
        const model = table[0].toLowerCase() + table.slice(1);
        try {
            const result = await prisma[model].deleteMany({});
            cleared.push(`  ✅ ${table} (${result.count} rows)`);
        }
        catch (e) {
            skipped.push(`  ⚠️  ${table}: ${e.message.split('\n')[0]}`);
        }
    }
    console.log(cleared.join('\n'));
    if (skipped.length) {
        console.log('\nSkipped (table may not exist yet):');
        console.log(skipped.join('\n'));
    }
    console.log(`\n✅ Done — ${cleared.length} tables cleared.`);
}
main()
    .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=clear-db.js.map