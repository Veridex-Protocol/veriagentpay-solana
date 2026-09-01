import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { smartWallet: true, socialNodes: true }
  });
  console.log('All Users in DB:', JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());
