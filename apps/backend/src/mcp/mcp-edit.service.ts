import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { parseCollects } from '../comics/comic-issue-list';
import {
  MAX_MAIN_CHARACTERS,
  normalizeMainCharacterNames,
} from '../comics/comic-main-characters';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import {
  McpChangeLogService,
  shorten,
  stoppedPartway,
} from './mcp-change-log.service';
import {
  ENTITY_NAMES,
  FIELDS,
  ITEM_ENTITY,
  SERIES_ENTITY,
  editableFields,
  type ChangeEntry,
  type EntityType,
  type FieldState,
} from './mcp-fields';
import type { McpMediaType } from './mcp-inspect.service';

/** How many items one bulk update may touch. */
export const MAX_BULK_IDS = 50;

export interface UpdateArgs {
  id?: string;
  ids?: string[];
  fields: Record<string, unknown>;
  dryRun?: boolean;
}

/**
 * update_item, update_series, update_collection, update_reading_list,
 * unlock_field and set_main_characters.
 *
 * Every write goes through the domain service, so it locks the field exactly
 * like a hand-edit, and is recorded in the change log with the stored value
 * and lock state before and after.
 */
@Injectable()
export class McpEditService {
  constructor(
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly changeLog: McpChangeLogService,
  ) {}

  updateItems(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    args: UpdateArgs,
  ): Promise<object> {
    return this.update(user, 'update_item', ITEM_ENTITY[mediaType], args);
  }

  updateSeries(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    args: UpdateArgs,
  ): Promise<object> {
    return this.update(user, 'update_series', SERIES_ENTITY[mediaType], args);
  }

  updateCollection(user: AuthenticatedUser, args: UpdateArgs): Promise<object> {
    return this.update(user, 'update_collection', 'comic_collection', args);
  }

  updateReadingList(
    user: AuthenticatedUser,
    args: UpdateArgs,
  ): Promise<object> {
    return this.update(user, 'update_reading_list', 'reading_list', args);
  }

  async unlockField(
    user: AuthenticatedUser,
    args: {
      mediaType: McpMediaType;
      level?: 'item' | 'series';
      id: string;
      field: string;
    },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const type =
      args.mediaType === 'comic' && !args.level
        ? await this.store.comicEntity(args.id)
        : args.level === 'series'
          ? SERIES_ENTITY[args.mediaType]
          : ITEM_ENTITY[args.mediaType];
    if (type === 'book_series') {
      throw new BadRequestException(
        'Audiobook and ebook series have no locked fields',
      );
    }
    await this.store.verifyAccess(user, type, args.id);

    const field = lockableField(type, args.field);
    const locked = await this.store.lockedFields(type, args.id);
    if (!field || !locked.includes(field)) {
      throw new BadRequestException(
        `${args.field} is not locked. ` +
          (locked.length > 0
            ? `Locked now: ${locked.join(', ')}`
            : 'Nothing is locked.'),
      );
    }

    const before = await this.store.read(type, args.id, [field]);
    await this.store.unlock(type, args.id, field);
    const after = await this.store.read(type, args.id, [field]);
    const changeSetId = await this.changeLog.record(user, 'unlock_field', [
      {
        entityType: type,
        entityId: args.id,
        field,
        before: before[field],
        after: after[field],
      },
    ]);
    return { changeSetId, id: args.id, unlocked: field };
  }

  async setMainCharacters(
    user: AuthenticatedUser,
    seriesId: string,
    names: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const normalized = normalizeMainCharacterNames(names);
    if (normalized.length === 0 || normalized.length > MAX_MAIN_CHARACTERS) {
      throw new BadRequestException(
        `Give one to ${MAX_MAIN_CHARACTERS} main characters`,
      );
    }
    await this.store.verifyAccess(user, 'comic_series', seriesId);

    const field = 'mainCharacters';
    const before = await this.store.read('comic_series', seriesId, [field]);
    await this.store.write(user, 'comic_series', seriesId, {
      [field]: normalized,
    });
    const after = await this.store.read('comic_series', seriesId, [field]);
    const changeSetId = await this.changeLog.record(
      user,
      'set_main_characters',
      [
        {
          entityType: 'comic_series',
          entityId: seriesId,
          field,
          before: before[field],
          after: after[field],
        },
      ],
    );
    return { changeSetId, id: seriesId, mainCharacters: after[field].value };
  }

  private async update(
    user: AuthenticatedUser,
    tool: string,
    type: EntityType,
    args: UpdateArgs,
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const ids = targetIds(args);
    const values = checkFields(type, args.fields);
    const fields = Object.keys(values);

    // Reading first checks every id before anything is written.
    const befores: Record<string, FieldState>[] = [];
    for (const id of ids) {
      await this.store.verifyAccess(user, type, id);
      befores.push(await this.store.read(type, id, fields));
    }

    if (args.dryRun) {
      return {
        dryRun: true,
        wouldUpdate: ids.length,
        items: ids.map((id, i) => ({
          id,
          fields: changes(befores[i], values),
        })),
      };
    }

    const changeSet = this.changeLog.open(user, tool);
    const items: object[] = [];
    try {
      for (const [i, id] of ids.entries()) {
        await this.store.write(user, type, id, values);
        const after = await this.store.read(type, id, fields);
        const entries: ChangeEntry[] = fields.map((field) => ({
          entityType: type,
          entityId: id,
          field,
          before: befores[i][field],
          after: after[field],
        }));
        await changeSet.add(entries);
        items.push({
          id,
          fields: changes(
            befores[i],
            Object.fromEntries(fields.map((f) => [f, after[f].value])),
          ),
        });
      }
    } catch (error) {
      throw stoppedPartway(error, changeSet, items.length, ids.length);
    }

    return {
      changeSetId: changeSet.idIfWritten,
      updated: ids.length,
      items,
    };
  }
}

function targetIds({ id, ids }: { id?: string; ids?: string[] }): string[] {
  if (id && ids) throw new BadRequestException('Give id or ids, not both');
  const list = id ? [id] : (ids ?? []);
  if (list.length === 0) throw new BadRequestException('Give id or ids');
  if (list.length > MAX_BULK_IDS) {
    throw new BadRequestException(`At most ${MAX_BULK_IDS} ids at a time`);
  }
  return [...new Set(list)];
}

/**
 * The fields that were sent, checked against what the entity has. Every
 * field the schema accepts belongs to some media type, so this is where an
 * ebook's `narrators` or a comic's `subtitle` is refused.
 */
export function checkFields(
  type: EntityType,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const sent = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  const allowed = editableFields(type);
  const name = ENTITY_NAMES[type].toLowerCase();
  const aName = `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name}`;
  if (Object.keys(sent).length === 0) {
    throw new BadRequestException(
      `No fields to change. ${aName} has: ${allowed.join(', ')}`,
    );
  }

  const unknown = Object.keys(sent).filter((f) => !allowed.includes(f));
  if (unknown.length > 0) {
    throw new BadRequestException(
      `${aName} has no ${unknown.join(', ')}. Fields: ${allowed.join(', ')}`,
    );
  }

  for (const [field, value] of Object.entries(sent)) {
    const blank =
      value === null || (typeof value === 'string' && value.trim() === '');
    if (FIELDS[type][field].required && blank) {
      throw new BadRequestException(`${field} cannot be empty`);
    }
  }

  if (type === 'comic_issue' && typeof sent.collects === 'string') {
    const { unrecognized } = parseCollects(sent.collects);
    if (unrecognized.length > 0) {
      throw new BadRequestException(
        `collects has issue numbers it cannot read: ${unrecognized.join(', ')}`,
      );
    }
  }
  return sent;
}

/** A field name, or a manualFields key, as the lockable field it names. */
function lockableField(type: EntityType, name: string): string | null {
  const specs = FIELDS[type];
  if (specs[name]?.lock) return name;
  const byLock = Object.entries(specs).find(([, spec]) => spec.lock === name);
  return byLock ? byLock[0] : null;
}

/** `{ field: { from, to } }`, with long text shortened. */
function changes(
  before: Record<string, FieldState>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  return Object.fromEntries(
    Object.entries(after).map(([field, value]) => [
      field,
      { from: shorten(before[field].value), to: shorten(value ?? null) },
    ]),
  );
}
