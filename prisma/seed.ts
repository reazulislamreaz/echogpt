import { PrismaClient } from '@prisma/client';

/**
 * Seed entrypoint.
 * Intentionally empty of application/business data for this foundation step.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  // No domain seed data yet — placeholder for future iterations.
  await Promise.resolve();
  console.log('Prisma seed: no application data to insert yet.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
