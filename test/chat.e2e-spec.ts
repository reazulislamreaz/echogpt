import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { encryptSecret } from '../src/common/utils/encryption.util';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Chat & Conversations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'StrongPassword123!';
  const ownerEmail = `chat_owner_${Date.now()}@example.com`;
  const otherEmail = `chat_other_${Date.now()}@example.com`;

  let ownerToken: string;
  let otherToken: string;
  let ownerId: string;
  let conversationId: string;
  let openaiId: string;
  const encryptionKey = process.env.ENCRYPTION_KEY ?? 'dev-local-encryption-key-change-me-32chars';

  beforeAll(async () => {
    process.env.AI_COMPLETION_MOCK = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
    prisma = app.get(PrismaService);

    const ownerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password, firstName: 'Owner' })
      .expect(201);
    ownerId = ownerReg.body.user.id;

    const ownerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(200);
    ownerToken = ownerLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password, firstName: 'Other' })
      .expect(201);
    const otherLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: otherEmail, password })
      .expect(200);
    otherToken = otherLogin.body.accessToken;

    const openai = await prisma.aIProvider.findUnique({ where: { slug: 'OPENAI' } });
    openaiId = openai!.id;

    await prisma.aIProvider.update({
      where: { id: openaiId },
      data: {
        encryptedApiKey: encryptSecret('sk-mock-provider-key-for-chat', encryptionKey),
        isActive: true,
        isDefault: true,
      },
    });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'chat_' } },
      select: { id: true },
    });

    for (const u of users) {
      const conversations = await prisma.conversation.findMany({
        where: { userId: u.id },
        select: { id: true },
      });
      for (const c of conversations) {
        await prisma.message.deleteMany({ where: { conversationId: c.id } });
      }
      await prisma.conversation.deleteMany({ where: { userId: u.id } });
      await prisma.aPIUsageLog.deleteMany({ where: { userId: u.id } });
      await prisma.userAIProvider.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  it('rejects unauthenticated chat access with 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations').expect(401);
  });

  it('creates and lists own conversations', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'My Chat', providerId: openaiId })
      .expect(201);

    conversationId = created.body.id;
    expect(created.body.title).toBe('My Chat');

    const list = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(list.body.items.some((c: { id: string }) => c.id === conversationId)).toBe(true);
  });

  it('blocks other users from reading/updating/deleting the conversation', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hacked' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('sends a message, stores history, and records usage without exposing secrets', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Hello EchoGPT' })
      .expect(200);

    expect(res.body.userMessage.content).toBe('Hello EchoGPT');
    expect(res.body.assistantMessage.content).toContain('Mock response');
    expect(JSON.stringify(res.body)).not.toContain('sk-mock-provider-key-for-chat');

    const history = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(history.body.items.length).toBeGreaterThanOrEqual(2);

    const usageCount = await prisma.aPIUsageLog.count({
      where: {
        userId: ownerId,
        endpoint: `/api/v1/conversations/${conversationId}/messages`,
        method: HttpMethod.POST,
        statusCode: 200,
      },
    });
    expect(usageCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects chat when usage limit is exceeded with 429', async () => {
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: ownerId, status: 'ACTIVE' },
      include: { plan: true },
    });

    const tinyPlan = await prisma.subscriptionPlan.create({
      data: {
        name: `CHAT_LIMIT_${Date.now()}`,
        slug: `chat-limit-${Date.now()}`,
        requestLimit: 1,
        price: 0,
      },
    });

    await prisma.subscription.update({
      where: { id: activeSub!.id },
      data: { planId: tinyPlan.id },
    });

    // One successful metered request already exists from prior test; add another to reach limit.
    await prisma.aPIUsageLog.create({
      data: {
        userId: ownerId,
        endpoint: '/api/v1/conversations/x/messages',
        method: HttpMethod.POST,
        statusCode: 200,
        responseTimeMs: 10,
        createdAt: activeSub!.currentPeriodStart,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Should be blocked' })
      .expect(429);

    // Restore original plan
    await prisma.subscription.update({
      where: { id: activeSub!.id },
      data: { planId: activeSub!.planId },
    });
    await prisma.subscriptionPlan.delete({ where: { id: tinyPlan.id } });
  });

  it('soft-deletes own conversation', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
