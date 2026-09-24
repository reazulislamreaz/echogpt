import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding initial reference data...');

  // 1. Roles
  const roles = [
    {
      name: 'USER',
      description: 'Standard user with basic access permissions',
    },
    {
      name: 'ADMIN',
      description: 'Administrator with full system access and management privileges',
    },
  ];

  for (const role of roles) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: {
        name: role.name,
        description: role.description,
      },
    });
    console.log(`✓ Role seeded: ${createdRole.name}`);
  }

  // 2. Subscription Plans
  const plans = [
    {
      name: 'FREE',
      slug: 'free',
      description: 'Free tier with standard access and rate limits',
      price: 0.0,
      currency: 'USD',
      billingCycle: 'monthly',
      requestLimit: 50,
      features: {
        maxRequestsPerDay: 50,
        webSearchEnabled: true,
        prioritySupport: false,
      },
      isActive: true,
    },
    {
      name: 'PREMIUM',
      slug: 'premium',
      description: 'Premium tier with expanded access and priority routing',
      price: 20.0,
      currency: 'USD',
      billingCycle: 'monthly',
      requestLimit: 2000,
      features: {
        maxRequestsPerDay: 2000,
        webSearchEnabled: true,
        prioritySupport: true,
      },
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const createdPlan = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        requestLimit: plan.requestLimit,
        features: plan.features,
        isActive: plan.isActive,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        requestLimit: plan.requestLimit,
        features: plan.features,
        isActive: plan.isActive,
      },
    });
    console.log(`✓ Subscription Plan seeded: ${createdPlan.name} (${createdPlan.slug})`);
  }

  // 3. AI Providers
  // Note: encryptedApiKey is intentionally omitted — real keys are configured by admins at runtime.
  // The first provider (OpenAI) is set as the system-wide default.
  // The partial unique index "ai_providers_one_default_idx" enforces at most one default.
  const aiProviders = [
    {
      name: 'OpenAI',
      slug: 'OPENAI',
      description: 'OpenAI models (e.g. GPT-4o, GPT-4o-mini)',
      baseUrl: 'https://api.openai.com/v1',
      isActive: true,
      isDefault: true,
    },
    {
      name: 'Anthropic Claude',
      slug: 'CLAUDE',
      description: 'Anthropic Claude models (e.g. Claude 3.5 Sonnet, Claude 3 Haiku)',
      baseUrl: 'https://api.anthropic.com/v1',
      isActive: true,
      isDefault: false,
    },
    {
      name: 'Google Gemini',
      slug: 'GEMINI',
      description: 'Google Gemini models (e.g. Gemini 1.5 Pro, Gemini 1.5 Flash)',
      baseUrl: 'https://generativelanguage.googleapis.com',
      isActive: true,
      isDefault: false,
    },
  ];

  for (const provider of aiProviders) {
    const createdProvider = await prisma.aIProvider.upsert({
      where: { slug: provider.slug },
      update: {
        name: provider.name,
        description: provider.description,
        baseUrl: provider.baseUrl,
        isActive: provider.isActive,
        isDefault: provider.isDefault,
      },
      create: {
        name: provider.name,
        slug: provider.slug,
        description: provider.description,
        baseUrl: provider.baseUrl,
        isActive: provider.isActive,
        isDefault: provider.isDefault,
      },
    });
    console.log(
      `✓ AI Provider seeded: ${createdProvider.name} [${createdProvider.slug}]${createdProvider.isDefault ? ' (DEFAULT)' : ''}`,
    );
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((error: unknown) => {
    console.error('Error during database seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
