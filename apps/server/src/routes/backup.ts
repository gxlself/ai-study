import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Lexicon, Lesson, MilestoneObservationInput } from '@sprout/schema';
import { options, type AppContext } from '../context';
import { ApiError, dateString, isoString, parse } from '../errors';
import { childInputSchema } from './children';
import { sessionInputSchema } from './sessions';
import { settingsSchema } from './settings';
import { upload } from './content';

const id = z.string().min(1).max(256);
const backupSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: isoString,
  children: z.array(childInputSchema.and(z.object({ id, createdAt: isoString, updatedAt: isoString }))).max(1000),
  sessions: z.array(sessionInputSchema.and(z.object({
    id, createdAt: isoString, deviceId: id.optional(),
  }))).max(100000),
  observations: z.array(MilestoneObservationInput.extend({
    childId: id, itemId: id, updatedAt: isoString, observedAt: dateString,
  })).max(100000),
  devices: z.array(z.object({
    id, name: z.string().min(1).max(80), kind: z.string().min(1).max(32), childId: id.nullable(),
    createdAt: isoString, lastSeenAt: isoString.nullable(),
  })).max(1000),
  settings: settingsSchema,
  custom: z.object({ lessons: z.array(Lesson).max(10000), lexicon: Lexicon }),
});

export function registerBackup(app: FastifyInstance, context: AppContext): void {
  const { store, packs } = context;
  app.get('/api/backup', options(context, 'admin', '备份', '导出家庭数据（不含密码或令牌）'), async (_request, reply) => {
    const backup = {
      schemaVersion: 1, createdAt: new Date().toISOString(),
      children: store.children(), sessions: store.sessions(), observations: store.observations(),
      devices: store.devices(), settings: store.settings(), custom: packs.customSnapshot(),
    };
    return reply.type('application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="sprout-backup.json"')
      .send(JSON.stringify(backup, null, 2));
  });
  app.post('/api/backup/restore', options(context, 'admin', '备份', '覆盖恢复家庭数据（设备需重新配对）'), async (request) => {
    let input = request.body;
    if (request.isMultipart()) {
      const { bytes } = await upload(request, 25 * 1024 * 1024);
      try { input = JSON.parse(bytes.toString('utf8')); }
      catch { throw new ApiError(400, 'INVALID_BACKUP', '备份不是有效的 JSON 文件'); }
    }
    const backup = parse(backupSchema, input);
    const unique = (values: string[], name: string) => {
      if (new Set(values).size !== values.length) throw new ApiError(400, 'INVALID_BACKUP', `备份中存在重复的${name}`);
    };
    unique(backup.children.map((child) => child.id), '孩子编号');
    unique(backup.devices.map((device) => device.id), '设备编号');
    unique(backup.sessions.map((session) => session.id), '记录编号');
    unique(backup.sessions.flatMap((session) => session.clientId ? [session.clientId] : []), '同步编号');
    unique(backup.observations.map((observation) => JSON.stringify([observation.childId, observation.itemId])), '观察记录');
    const children = new Set(backup.children.map((child) => child.id));
    const devices = new Set(backup.devices.map((device) => device.id));
    if (backup.devices.some((device) => device.childId !== null && !children.has(device.childId)) ||
      backup.sessions.some((session) => !children.has(session.childId) || (session.deviceId && !devices.has(session.deviceId))) ||
      backup.observations.some((observation) => !children.has(observation.childId))) {
      throw new ApiError(400, 'INVALID_BACKUP', '备份包含不存在的孩子或设备引用');
    }
    const previousCustom = packs.customSnapshot();
    let customReplaced = false;
    try {
      store.transaction(() => {
        packs.restoreCustom(backup.custom);
        customReplaced = true;
        store.db.exec('DELETE FROM pairings; DELETE FROM sessions; DELETE FROM milestone_observations; DELETE FROM devices; DELETE FROM children;');
        for (const child of backup.children) store.putChild(child);
        for (const device of backup.devices) store.putDevice(device);
        for (const session of backup.sessions) store.putSession({
          ...session, startedAt: new Date(session.startedAt).toISOString(), endedAt: new Date(session.endedAt).toISOString(),
        });
        for (const observation of backup.observations) store.putObservation(observation);
        store.setSetting('public', backup.settings);
      });
    } catch (error) {
      if (customReplaced) packs.restoreCustom(previousCustom);
      throw error;
    }
    return { ok: true, devicesRequirePairing: true };
  });
}
