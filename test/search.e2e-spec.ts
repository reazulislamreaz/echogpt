import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Web Search (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'StrongPassword123!';
  const ownerEmail = `search_owner_${Date.now()}@example.com`;
  const otherEmail = `search_other_${Date.now()}@example.com`;

  let ownerToken: string;
  let otherToken: string;
  let ownerId: string;
  let searchId: string;

  beforeAll(async () => {
    process.env.WEB_SEARCH_MOCK = 'true';

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
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'search_' } },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.webSearch.deleteMany({ where: { userId: u.id } });
      await prisma.aPIUsageLog.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  it('rejects unauthenticated search and history access with 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/web-search').send({ query: 'x' }).expect(401);
    await request(app.getHttpServer()).get('/api/v1/web-search/history').expect(401);
  });

  it('rejects empty search query with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/web-search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ query: '   ' })
      .expect(400);
  });

  it('performs a search, persists history, and does not expose secrets', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/web-search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ query: 'NestJS web search', limit: 5 })
      .expect(201);

    searchId = res.body.id;
    expect(res.body.query).toBe('NestJS web search');
    expect(res.body.provider).toBe('mock');
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i);

    const usageCount = await prisma.aPIUsageLog.count({
      where: {
        userId: ownerId,
        endpoint: '/api/v1/web-search',
        method: HttpMethod.POST,
        statusCode: 201,
      },
    });
    // Usage is recorded with statusCode 200 on success in service
    const usageOk = await prisma.aPIUsageLog.count({
      where: {
        userId: ownerId,
        endpoint: '/api/v1/web-search',
        method: HttpMethod.POST,
        statusCode: 200,
      },
    });
    expect(usageCount + usageOk).toBeGreaterThanOrEqual(1);
  });

  it('lists own history and recent searches ordered newest first', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/web-search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ query: 'Prisma pagination' })
      .expect(201);

    const history = await request(app.getHttpServer())
      .get('/api/v1/web-search/history')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(history.body.items.length).toBeGreaterThanOrEqual(2);
    expect(history.body.meta.total).toBeGreaterThanOrEqual(2);

    const recent = await request(app.getHttpServer())
      .get('/api/v1/web-search/recent?limit=5')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(recent.body)).toBe(true);
    expect(recent.body[0].query).toBe('Prisma pagination');
  });

  it('returns suggestions from the current user history only', async () => {
    const suggestions = await request(app.getHttpServer())
      .get('/api/v1/web-search/suggestions?q=Nest')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(suggestions.body.suggestions.some((s: string) => s.includes('NestJS'))).toBe(true);
  });

  it('blocks other users from reading or deleting a search record', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/web-search/${searchId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/web-search/${searchId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('rejects search when usage limit is exceeded with 429', async () => {
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: ownerId, status: 'ACTIVE' },
    });

    const tinyPlan = await prisma.subscriptionPlan.create({
      data: {
        name: `SEARCH_LIMIT_${Date.now()}`,
        slug: `search-limit-${Date.now()}`,
        requestLimit: 1,
        price: 0,
      },
    });

    await prisma.subscription.update({
      where: { id: activeSub!.id },
      data: { planId: tinyPlan.id },
    });

    await prisma.aPIUsageLog.create({
      data: {
        userId: ownerId,
        endpoint: '/api/v1/web-search',
        method: HttpMethod.POST,
        statusCode: 200,
        responseTimeMs: 10,
        createdAt: activeSub!.currentPeriodStart,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/web-search')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ query: 'Should be blocked' })
      .expect(429);

    await prisma.subscription.update({
      where: { id: activeSub!.id },
      data: { planId: activeSub!.planId },
    });
    await prisma.subscriptionPlan.delete({ where: { id: tinyPlan.id } });
  });

  it('allows owner to delete own search record', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/web-search/${searchId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/web-search/${searchId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
