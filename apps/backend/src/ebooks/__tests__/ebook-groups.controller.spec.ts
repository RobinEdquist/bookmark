jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class {},
  AllowAnonymous: () => () => undefined,
}));
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CanEditMetadataGuard } from '../../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../../common/guards/can-delete.guard';
import { OpdsAuthGuard } from '../../common/guards/opds-auth.guard';
import { buildSwaggerConfig } from '../../swagger';
import { EbookGroupsController } from '../ebook-groups.controller';
import { EbookGroupsService } from '../ebook-groups.service';
import { OpdsController } from '../opds.controller';
import { OpdsService } from '../opds.service';
import { EbookDetailDto } from '../dto/ebook-response.dto';

const GROUP_ID = '550e8400-e29b-41d4-a716-446655440000';
const EBOOK_ID = '550e8400-e29b-41d4-a716-446655440001';
const ROOT = '/api/ebooks/groups';

describe('Ebook group HTTP and OpenAPI contracts', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const groups = {
    addEbook: jest.fn().mockResolvedValue({ success: true }),
    updateCoverFromFile: jest
      .fn()
      .mockResolvedValue({ coverUrl: `${ROOT}/${GROUP_ID}/cover` }),
    update: jest.fn().mockResolvedValue({ success: true }),
    getCover: jest
      .fn()
      .mockResolvedValue({ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }),
  };
  const opds = { buildGroupFeed: jest.fn().mockResolvedValue('<feed/>') };

  beforeAll(async () => {
    let builder = Test.createTestingModule({
      controllers: [EbookGroupsController, OpdsController],
      providers: [
        { provide: EbookGroupsService, useValue: groups },
        { provide: OpdsService, useValue: opds },
      ],
    });
    for (const guard of [
      AuthGuard,
      CanEditMetadataGuard,
      CanDeleteGuard,
      OpdsAuthGuard,
    ]) {
      builder = builder
        .overrideGuard(guard)
        .useValue({ canActivate: () => true });
    }
    const module = await builder.compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req, _res, next) => {
      req.session = { user: { id: 'reader' } };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    document = SwaggerModule.createDocument(app, buildSwaggerConfig(), {
      extraModels: [EbookDetailDto],
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('returns the documented 200 for membership and cover uploads', async () => {
    const member = await request(app.getHttpServer())
      .post(`${ROOT}/${GROUP_ID}/ebooks`)
      .send({ ebookId: EBOOK_ID });
    expect(member.status).toBe(200);
    expect(member.body).toEqual({ success: true });
    const cover = await request(app.getHttpServer())
      .post(`${ROOT}/${GROUP_ID}/cover`)
      .attach('file', Buffer.from('image'), {
        filename: 'cover.jpg',
        contentType: 'image/jpeg',
      });
    expect(cover.status).toBe(200);
    for (const suffix of ['ebooks', 'cover']) {
      expect(
        document.paths[`${ROOT}/{id}/${suffix}`].post?.responses['200'],
      ).toBeDefined();
      expect(
        document.paths[`${ROOT}/{id}/${suffix}`].post?.responses['201'],
      ).toBeUndefined();
    }
  });

  it('rejects null names before reaching the service, but allows omission', async () => {
    await request(app.getHttpServer())
      .patch(`${ROOT}/${GROUP_ID}`)
      .send({ name: null })
      .expect(400);
    expect(groups.update).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .patch(`${ROOT}/${GROUP_ID}`)
      .send({ description: null })
      .expect(200);
  });

  it('rejects invalid OPDS UUIDs before querying the database', async () => {
    await request(app.getHttpServer())
      .get('/api/ebooks/opds/groups/not-a-uuid')
      .expect(400);
    expect(opds.buildGroupFeed).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get(`/api/ebooks/opds/groups/${GROUP_ID}`)
      .expect(200)
      .expect('Content-Type', /application\/atom\+xml/);
  });

  it('serves conditional JPEG covers with the documented media type', async () => {
    const result = await request(app.getHttpServer())
      .get(`${ROOT}/${GROUP_ID}/cover`)
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    await request(app.getHttpServer())
      .get(`${ROOT}/${GROUP_ID}/cover`)
      .set('If-None-Match', result.headers.etag)
      .expect(304);
    expect(
      document.paths[`${ROOT}/{id}/cover`].get?.responses['200'],
    ).toMatchObject({
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      },
    });
    for (const path of [
      '/api/ebooks/opds/groups',
      '/api/ebooks/opds/groups/{id}',
    ]) {
      expect(document.paths[path].get?.responses['200']).toMatchObject({
        content: { 'application/atom+xml': { schema: { type: 'string' } } },
      });
    }
  });

  it('exports validation constraints and the embedded ebook membership schema', () => {
    const schemas = document.components?.schemas;
    expect(schemas?.CreateEbookGroupDto).toMatchObject({
      properties: {
        name: { minLength: 1, maxLength: 300 },
        sortName: { nullable: true, maxLength: 300 },
        description: { nullable: true, maxLength: 10000 },
      },
    });
    expect(schemas?.AddEbookGroupMemberDto).toMatchObject({
      properties: { role: { nullable: true, maxLength: 120 } },
    });
    expect(schemas?.ReorderEbookGroupMembersDto).toMatchObject({
      properties: {
        ebookIds: {
          uniqueItems: true,
          items: { type: 'string', format: 'uuid' },
        },
      },
    });
    expect(schemas?.EbookDetailDto).toMatchObject({
      properties: {
        groups: { items: { $ref: '#/components/schemas/EbookDetailGroupDto' } },
      },
    });
    expect(document.paths[ROOT].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          schema: expect.objectContaining({
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 50,
          }),
        }),
        expect.objectContaining({
          name: 'offset',
          schema: expect.objectContaining({ type: 'integer', minimum: 0 }),
        }),
      ]),
    );
  });

  it('documents authentication, permission, validation and missing-resource errors', () => {
    for (const [path, methods] of Object.entries(document.paths)) {
      if (!path.startsWith(ROOT)) continue;
      for (const method of ['get', 'post', 'patch', 'delete'] as const) {
        const operation = methods[method];
        if (!operation) continue;
        expect(operation.responses['400']).toBeDefined();
        expect(operation.responses['401']).toBeDefined();
        if (method !== 'get') expect(operation.responses['403']).toBeDefined();
        if (path.includes('{id}'))
          expect(operation.responses['404']).toBeDefined();
      }
    }
    const cover = document.paths[`${ROOT}/{id}/cover`].post!;
    expect(cover.responses['413']).toBeDefined();
    expect(cover.responses['422']).toBeDefined();
  });
});
