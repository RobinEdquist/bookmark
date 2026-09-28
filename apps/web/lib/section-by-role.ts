export interface RoleSection<T> {
  role: string | null;
  members: T[];
}

/**
 * Groups members by their free-text role, keeping each role in the order its
 * earliest member appears. A blank role is the unlabeled section.
 */
export function sectionByRole<
  T extends { role: string | null; position: number },
>(members: T[]): RoleSection<T>[] {
  const buckets = new Map<string | null, T[]>();
  const ordered = [...members].sort((a, b) => a.position - b.position);
  for (const member of ordered) {
    const role = member.role?.trim() ? member.role : null;
    const list = buckets.get(role);
    if (list) {
      list.push(member);
    } else {
      buckets.set(role, [member]);
    }
  }

  return [...buckets.entries()]
    .map(([role, sectionMembers]) => ({
      role,
      members: sectionMembers,
      order: Math.min(...sectionMembers.map((member) => member.position)),
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ role, members: sectionMembers }) => ({
      role,
      members: sectionMembers,
    }));
}
