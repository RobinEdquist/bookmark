import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import {
  McpChangeLogService,
  shorten,
  stoppedPartway,
  type ChangeRow,
} from './mcp-change-log.service';
import { McpStructureService, type MovingBook } from './mcp-structure.service';
import type { ReadingListEntryState } from '../reading-lists/reading-list-order';
import {
  CREATED_FIELD,
  DELETED_FIELD,
  ENTITY_TYPES,
  FIELDS,
  LINK_FIELD_PREFIX,
  sameValue,
  type ChangeEntry,
  type EntityType,
  type FieldState,
} from './mcp-fields';

export const MERGE_NOT_UNDONE =
  'A merge cannot be undone: it deleted the emptied series. Each deleted ' +
  "series' fields, main characters, collections and issue ids are in the " +
  'change log (list_changes with this changeSetId and full: true), so it can ' +
  'be rebuilt with create_series, update_series and move_items.';

interface Step {
  row: ChangeRow;
  type: EntityType;
  before: FieldState;
  current: FieldState;
}

interface Skipped {
  entityType: string;
  id: string;
  field: string;
  reason: string;
}

/**
 * undo_change: puts back the `before` values of one change set.
 *
 * Covered: field edits and unlocks, main characters, issue moves, collection
 * and reading list edits and membership. Not covered: creating records and deleting emptied
 * series (undoing either would mean a delete or a rebuild), and external
 * links. A whole merge is refused.
 *
 * A row is skipped if the value changed again after the change, unless
 * `force` is set. The undo is itself a change set, so it can be undone.
 */
@Injectable()
export class McpUndoService {
  constructor(
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly structure: McpStructureService,
    private readonly changeLog: McpChangeLogService,
  ) {}

  async undo(
    user: AuthenticatedUser,
    args: { changeSetId: string; dryRun?: boolean; force?: boolean },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const rows = await this.changeLog.changeSet(args.changeSetId);
    if (rows.length === 0) {
      throw new NotFoundException('No change set with that id');
    }
    if (rows[0].tool === 'merge_series') {
      throw new BadRequestException(MERGE_NOT_UNDONE);
    }
    const pending = rows.filter((row) => !row.undoneBy).reverse();
    if (pending.length === 0) {
      throw new BadRequestException('This change set is already undone');
    }

    const steps: Step[] = [];
    const skipped: Skipped[] = [];
    for (const row of pending) {
      const result = await this.plan(row, args.force ?? false);
      if ('reason' in result) {
        skipped.push({ ...ref(row), reason: result.reason });
      } else {
        steps.push(result);
      }
    }

    if (args.dryRun) {
      return {
        dryRun: true,
        wouldUndo: steps.map((step) => ({
          ...ref(step.row),
          from: shorten(step.current.value),
          to: shorten(step.before.value),
        })),
        skipped,
      };
    }
    if (steps.length === 0) {
      throw new BadRequestException(
        `Nothing to undo. ${skipped.map((s) => `${s.field}: ${s.reason}`).join(' ')}`,
      );
    }

    const changeSet = this.changeLog.open(user, 'undo_change');
    let done = 0;
    try {
      for (const group of groupSteps(steps)) {
        await this.apply(user, group, changeSet);
        await this.changeLog.markUndone(
          group.map((step) => step.row.id),
          changeSet.id,
        );
        done += group.length;
      }
    } catch (error) {
      throw stoppedPartway(error, changeSet, done, steps.length);
    }

    return { changeSetId: changeSet.idIfWritten, undone: done, skipped };
  }

  private async plan(
    row: ChangeRow,
    force: boolean,
  ): Promise<Step | { reason: string }> {
    if (row.field === CREATED_FIELD) {
      return { reason: 'Creating is not undone; nothing is deleted here' };
    }
    if (row.field === DELETED_FIELD) {
      return {
        reason:
          'The series was deleted when it was emptied. Rebuild it by hand from this row (list_changes with full: true)',
      };
    }
    if (row.field.startsWith(LINK_FIELD_PREFIX)) {
      return { reason: 'Links are not undone here' };
    }

    const type = row.entityType as EntityType;
    if (!ENTITY_TYPES.includes(type) || !FIELDS[type][row.field]) {
      return { reason: 'Not a field undo can restore' };
    }
    const before = row.before as FieldState;
    const after = row.after as FieldState;

    let current: FieldState;
    try {
      current = (await this.store.read(type, row.entityId, [row.field]))[
        row.field
      ];
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { reason: 'It no longer exists' };
      }
      throw error;
    }

    if (
      !force &&
      (!sameValue(current.value, after.value) ||
        current.locked !== after.locked)
    ) {
      return {
        reason: 'Changed again since. Pass force: true to undo anyway',
      };
    }
    if (
      type === 'comic_issue' &&
      row.field === 'series' &&
      (await this.store.existingSeries([before.value as string])).length === 0
    ) {
      return {
        reason:
          'Its old series was deleted when it was emptied. Rebuild it by hand from the deleted row in this change set',
      };
    }
    return { row, type, before, current };
  }

  /** Writes one group back and records it. */
  private async apply(
    user: AuthenticatedUser,
    group: Step[],
    changeSet: ReturnType<McpChangeLogService['open']>,
  ): Promise<void> {
    const [{ type, row }] = group;
    const id = row.entityId;

    if (type === 'comic_issue' && row.field === 'series') {
      // A group of moves shares one destination: the issues' old series.
      const moving: MovingBook[] = group.map((step) => ({
        id: step.row.entityId,
        seriesId: step.current.value as string,
        locked: step.current.locked ?? false,
      }));
      const unpin = new Set(
        group.filter((step) => !step.before.locked).map((s) => s.row.entityId),
      );
      await this.structure.applyMove(
        moving,
        group[0].before.value as string,
        changeSet,
        unpin,
      );
      return;
    }

    const fields = group.map((step) => step.row.field);
    if (type === 'comic_collection' && fields.includes('members')) {
      await this.store.setCollectionMembers(
        id,
        group[0].before.value as string[],
      );
    } else if (type === 'reading_list' && fields.includes('entries')) {
      await this.store.setReadingListEntries(
        id,
        group[0].before.value as ReadingListEntryState[],
      );
    } else {
      await this.store.write(
        user,
        type,
        id,
        Object.fromEntries(group.map((s) => [s.row.field, s.before.value])),
      );
      // Writing locks every field; unlock those that were not locked.
      for (const step of group) {
        if (step.before.locked === false) {
          await this.store.unlock(type, id, step.row.field);
        }
      }
    }

    const after = await this.store.read(type, id, fields);
    await changeSet.add(
      group.map((step): ChangeEntry => ({
        entityType: type,
        entityId: id,
        field: step.row.field,
        before: step.current,
        after: after[step.row.field],
      })),
    );
  }
}

/**
 * Steps grouped so each group is one write: an entity's plain fields
 * together, collection members and reading list entries alone, and issue
 * moves by destination.
 */
function groupSteps(steps: Step[]): Step[][] {
  const groups = new Map<string, Step[]>();
  for (const step of steps) {
    const { type, row, before } = step;
    const key =
      type === 'comic_issue' && row.field === 'series'
        ? `move:${String(before.value)}`
        : row.field === 'members' || row.field === 'entries'
          ? `${row.field}:${row.entityId}`
          : `fields:${type}:${row.entityId}`;
    const group = groups.get(key) ?? [];
    group.push(step);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function ref(row: ChangeRow) {
  return { entityType: row.entityType, id: row.entityId, field: row.field };
}
