import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { CanRequestGuard } from '../common/guards/can-request.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { TrackerService } from '../tracker';
import { buildSwaggerConfig } from '../swagger';
import { RequestsController } from './requests.controller';
import { RequestsAdminController } from './requests-admin.controller';
import { RequestsService } from './requests.service';

describe('Request OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const book = { title: 'The Hobbit', contentType: 'audiobook' };
  const result = { id, status: 'waiting' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RequestsController, RequestsAdminController],
      providers: [
        {
          provide: RequestsService,
          useValue: {
            createRequest: jest.fn().mockResolvedValue(result),
            getRequestById: jest.fn().mockResolvedValue(result),
            addSupporter: jest.fn().mockResolvedValue(undefined),
            approveRequest: jest.fn().mockResolvedValue(result),
            rejectRequest: jest.fn().mockResolvedValue(result),
            recheckRequest: jest.fn().mockResolvedValue(result),
            getAttempts: jest.fn().mockResolvedValue([]),
            getUserRequests: jest.fn().mockResolvedValue([]),
            getAllRequests: jest.fn().mockResolvedValue([]),
            search: jest.fn().mockResolvedValue({ results: [], total: 0 }),
          },
        },
        { provide: TrackerService, useValue: {} },
      ],
    })
      .overrideGuard(CanRequestGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { apiTokenUser: { id, role: 'admin' } });
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['/api/requests', book],
    ['/api/requests/search', { query: 'Hobbit' }],
    [`/api/requests/${id}/support`, {}],
    [`/api/admin/requests/${id}/approve`, {}],
    [`/api/admin/requests/${id}/reject`, {}],
    [`/api/admin/requests/${id}/recheck`, {}],
  ])('documents the actual success code for POST %s', async (path, body) => {
    const response = await request(app.getHttpServer()).post(path).send(body);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    const operation = document.paths[path.replace(id, '{id}')]?.post;
    expect(operation?.responses[String(response.status)]).toBeDefined();
  });

  it.each(['/api/requests', '/api/admin/requests'])(
    'documents %s as an array',
    (path) => {
      expect(document.paths[path]?.get?.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/ContentRequestDto' },
            },
          },
        },
      });
    },
  );

  it('documents both creation forms and accepts book-only and selected-release requests', async () => {
    expect(document.paths['/api/requests']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/CreateRequestDto' },
              {
                oneOf: [
                  {
                    properties: { torrentId: { nullable: true, enum: [null] } },
                  },
                  { required: ['torrentId', 'categoryId'] },
                ],
              },
            ],
          },
        },
      },
    });
    for (const body of [
      book,
      { ...book, torrentId: null },
      { ...book, torrentId: 123, categoryId: 13 },
    ]) {
      await request(app.getHttpServer())
        .post('/api/requests')
        .send(body)
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/requests')
      .send({ ...book, torrentId: 123 })
      .expect(400);
  });

  it('exports creation constraints and waiting lifecycle fields', () => {
    expect(document.components?.schemas?.CreateRequestDto).toMatchObject({
      required: ['title', 'contentType'],
      properties: {
        title: { minLength: 1, maxLength: 500 },
        torrentId: { type: 'integer', minimum: 1 },
        categoryId: { type: 'integer' },
        languages: { type: 'array', maxItems: 20, items: { type: 'integer' } },
      },
    });
    expect(document.components?.schemas?.ContentRequestDto).toMatchObject({
      properties: {
        status: { enum: expect.arrayContaining(['waiting']) },
        torrentId: { type: 'string', nullable: true },
        languageNames: { type: 'array', items: { type: 'string' } },
        approvedAt: { format: 'date-time', nullable: true },
        lastSearchAt: { format: 'date-time', nullable: true },
        nextSearchAt: { format: 'date-time', nullable: true },
        releaseDate: { format: 'date-time', nullable: true },
      },
    });
    expect(document.components?.schemas?.RequestAttemptDto).toMatchObject({
      properties: {
        id: { format: 'uuid' },
        status: {
          enum: ['submitting', 'tracking', 'uncertain', 'failed', 'complete'],
        },
        createdAt: { format: 'date-time' },
      },
    });
  });

  it('documents permissions and missing/ineligible requests for new admin endpoints', () => {
    const attempts = document.paths['/api/admin/requests/{id}/attempts']?.get;
    const recheck = document.paths['/api/admin/requests/{id}/recheck']?.post;
    expect(attempts?.responses).toEqual(
      expect.objectContaining({
        '200': expect.any(Object),
        '401': expect.any(Object),
        '403': expect.any(Object),
        '404': expect.any(Object),
      }),
    );
    expect(recheck?.responses).toEqual(
      expect.objectContaining({
        '200': expect.any(Object),
        '400': expect.any(Object),
        '401': expect.any(Object),
        '403': expect.any(Object),
      }),
    );
    for (const operation of [attempts, recheck]) {
      expect(operation?.security).toEqual(
        expect.arrayContaining([
          { 'better-auth.session_token': [] },
          { 'api-key': [] },
        ]),
      );
    }
  });
});
