import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Audience, Domain, allJsonSchemas } from '@sprout/schema';
import { ApiError, parse } from '../errors';
import { options, parameter, type AppContext } from '../context';
import { safePath } from '../content/files';

export async function upload(request: FastifyRequest, maxBytes: number): Promise<{ bytes: Buffer; filename: string; mimetype: string }> {
  if (!request.isMultipart()) throw new ApiError(400, 'FILE_REQUIRED', '请使用 multipart/form-data 上传 file 文件');
  let result: { bytes: Buffer; filename: string; mimetype: string } | undefined;
  for await (const part of request.parts({ limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 6 } })) {
    if (part.type === 'file') {
      const bytes = await part.toBuffer();
      if (part.file.truncated || bytes.length > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE', '上传文件超过大小限制');
      if (part.fieldname !== 'file') throw new ApiError(400, 'FILE_REQUIRED', '上传字段必须命名为 file');
      result = { bytes, filename: part.filename, mimetype: part.mimetype };
    }
  }
  if (!result || !result.bytes.length) throw new ApiError(400, 'FILE_REQUIRED', '请选择非空文件');
  return result;
}

export function registerContent(app: FastifyInstance, context: AppContext): void {
  const { packs, tts } = context;
  const route = (scope: 'admin' | 'either' | 'public', summary: string) => options(context, scope, '内容', summary);
  app.get('/api/schemas', route('public', '全部内容与活动 JSON Schema'), async () => allJsonSchemas());
  app.get('/api/packs', route('either', '内容包列表'), async () => packs.list());
  app.post('/api/packs/import', route('admin', '导入内容包 ZIP'), async (request, reply) => {
    const { bytes } = await upload(request, 50 * 1024 * 1024);
    const pack = packs.importZip(bytes);
    reply.code(201);
    return { ...pack, issues: packs.validate(pack.id) };
  });
  app.post('/api/packs/reload', route('admin', '重新扫描磁盘内容'), async () => packs.reload());
  app.put('/api/packs/:id', route('admin', '启用或停用内容包'), async (request) => {
    const { enabled } = parse(z.object({ enabled: z.boolean() }).strict(), request.body);
    return packs.setEnabled(parameter(request), enabled);
  });
  app.delete('/api/packs/:id', route('admin', '删除导入的内容包'), async (request) => {
    packs.deletePack(parameter(request));
    return { ok: true };
  });
  app.get('/api/packs/:id/export', route('admin', '导出内容包 ZIP'), async (request, reply) => {
    const bytes = packs.exportZip(parameter(request));
    return reply.type('application/zip')
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(parameter(request))}.zip"`)
      .send(Buffer.from(bytes));
  });
  app.get('/api/packs/:id/validate', route('admin', '内容校验报告'), async (request) => ({ issues: packs.validate(parameter(request)) }));
  app.get('/api/lexicon', route('either', '启用内容包词库'), async (request) => {
    const query = parse(z.object({ packId: z.string().optional(), category: z.string().optional(), q: z.string().optional() }), request.query);
    return packs.listConcepts(query);
  });
  app.post('/api/lexicon', route('admin', '新增自定义词条'), async (request, reply) => {
    const concept = packs.saveConcept(request.body);
    reply.code(201);
    return concept;
  });
  app.put('/api/lexicon/:id', route('admin', '修改自定义词条'), async (request) => packs.saveConcept(request.body, parameter(request)));
  app.delete('/api/lexicon/:id', route('admin', '删除自定义词条'), async (request) => {
    packs.deleteConcept(parameter(request));
    return { ok: true };
  });
  app.get('/api/lessons', route('either', '可用课程列表'), async (request) => {
    const query = parse(z.object({
      age: z.coerce.number().min(0).max(72).optional(), domain: Domain.optional(), q: z.string().optional(),
      packId: z.string().optional(), themeId: z.string().optional(), audience: Audience.optional(),
    }), request.query);
    return packs.listLessons(query);
  });
  app.get('/api/lessons/:id', route('either', '读取课程详情'), async (request) => {
    const lesson = packs.getLesson(parameter(request));
    if (!lesson) throw new ApiError(404, 'LESSON_NOT_FOUND', '课程不存在、未启用或校验未通过');
    return lesson;
  });
  app.post('/api/lessons', route('admin', '创建自定义课程'), async (request, reply) => {
    const result = packs.saveLesson(request.body);
    tts.enqueueLesson(result.lesson);
    reply.code(201);
    return result.lesson;
  });
  app.put('/api/lessons/:id', route('admin', '保存自定义课程'), async (request) => {
    const result = packs.saveLesson(request.body, parameter(request));
    tts.enqueueLesson(result.lesson);
    return result.lesson;
  });
  app.delete('/api/lessons/:id', route('admin', '删除自定义课程'), async (request) => {
    packs.deleteLesson(parameter(request));
    return { ok: true };
  });
  app.post('/api/lessons/:id/duplicate', route('admin', '将课程复制为自定义课'), async (request, reply) => {
    const result = packs.duplicateLesson(parameter(request));
    tts.enqueueLesson(result.lesson);
    reply.code(201);
    return result.lesson;
  });
  app.get('/api/routes', route('either', '成长路线列表'), async () => packs.listRoutes());
  app.get('/api/routes/:id', route('either', '成长路线详情'), async (request) => {
    const result = packs.getRoute(parameter(request));
    if (!result) throw new ApiError(404, 'ROUTE_NOT_FOUND', '成长路线不存在或已停用');
    return result;
  });
  app.post('/api/media', route('admin', '上传图片或音频（最多 10 MB）'), async (request, reply) => {
    const file = await upload(request, 10 * 1024 * 1024);
    const extension = extname(file.filename).toLowerCase();
    validateMedia(file.bytes, extension);
    const customRoot = packs.getPack('sprout.custom')!.dir;
    const directory = safePath(customRoot, 'assets/uploads');
    mkdirSync(directory, { recursive: true });
    const path = `assets/uploads/${randomUUID()}${extension}`;
    writeFileSync(safePath(customRoot, path), file.bytes, { flag: 'wx', mode: 0o600 });
    reply.code(201);
    return { path, url: `/packs/sprout.custom/${path}` };
  });
}

function validateMedia(bytes: Buffer, extension: string): void {
  const matches: Record<string, () => boolean> = {
    '.png': () => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    '.jpg': () => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    '.jpeg': () => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    '.gif': () => /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)),
    '.webp': () => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    '.mp3': () => bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224),
    '.m4a': () => bytes.toString('ascii', 4, 8) === 'ftyp',
    '.mp4': () => bytes.toString('ascii', 4, 8) === 'ftyp',
    '.svg': () => {
      const svg = bytes.toString('utf8');
      return /<svg(?:\s|>)/i.test(svg) &&
        !/<(?:script|foreignObject|iframe|object|embed|style|animate|set|image|use)\b/i.test(svg) &&
        !/\bon\w+\s*=|<!ENTITY|<!DOCTYPE|javascript:|data:|url\s*\(|(?:href|src)\s*=/i.test(svg);
    },
  };
  if (!matches[extension]?.()) throw new ApiError(400, 'INVALID_MEDIA', '文件类型不支持、内容与扩展名不符，或 SVG 含有主动内容');
}
