/**
 * ERD-specific validation, run AFTER validate() so edge endpoints are
 * absolute paths. docKind "erd" requires every node to be a table;
 * column-anchored edges and fk metadata are checked whenever they appear
 * (mixed diagrams may embed the odd table too).
 */
import type {
  DiagramModel,
  Edge,
  Element,
  NodeEl,
  TableColumn,
  ValidationIssue,
} from "./types.ts";

export function validateErd(model: DiagramModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string, site?: string) =>
    issues.push({ severity: "error", message, site });
  const warn = (message: string, site?: string) =>
    issues.push({ severity: "warning", message, site });

  // collect every node (groups, grid cells, and bands may nest them)
  const nodes = new Map<string, NodeEl>();
  const visit = (els: Element[]): void => {
    for (const el of els) {
      if (el.type === "node") nodes.set(el.path, el);
      else {
        visit(el.children);
        if (el.grid) for (const cell of Object.values(el.grid.cells)) visit(cell.children);
      }
    }
  };
  visit(model.children);
  for (const band of model.bands) visit(band.children);

  if (model.docKind === "erd") {
    for (const n of nodes.values()) {
      if (!n.table) err(`erd node ${n.path} has no table — every erd node must be a table`, n.site);
    }
  }

  /** resolve an edge endpoint's column, collecting errors along the way */
  const endpoint = (
    edge: Edge,
    path: string,
    column: string | undefined,
    what: "sourceColumn" | "targetColumn",
  ): TableColumn | undefined => {
    if (column === undefined) return undefined;
    const node = nodes.get(path);
    if (!node) {
      err(`edge ${edge.id} ${what} "${column}" — endpoint "${path}" is not a node`, edge.site);
      return undefined;
    }
    if (!node.table) {
      err(`edge ${edge.id} ${what} "${column}" — node ${path} has no table`, edge.site);
      return undefined;
    }
    const col = node.table.columns.find((c) => c.name === column);
    if (!col) err(`edge ${edge.id} ${what} "${column}" does not exist on table ${path}`, edge.site);
    return col;
  };

  const tableId = (path: string): string => path.split("/").pop() ?? path;

  for (const edge of model.edges) {
    const sCol = endpoint(edge, edge.from, edge.sourceColumn, "sourceColumn");
    const tCol = endpoint(edge, edge.to, edge.targetColumn, "targetColumn");
    // fk metadata must agree with the edge it decorates (either direction)
    const check = (
      col: TableColumn | undefined,
      ownPath: string,
      otherPath: string,
      otherColumn: string | undefined,
    ) => {
      if (!col?.fk) return;
      const other = nodes.get(otherPath);
      const tableMatch =
        col.fk.table === tableId(otherPath) ||
        (other?.label !== undefined && col.fk.table === other.label);
      const columnMatch = otherColumn === undefined || col.fk.column === otherColumn;
      if (!tableMatch || !columnMatch)
        warn(
          `edge ${edge.id}: ${tableId(ownPath)}.${col.name} declares fk -> ` +
            `${col.fk.table}.${col.fk.column} but the edge connects ` +
            `${tableId(otherPath)}.${otherColumn ?? "?"}`,
          edge.site,
        );
    };
    check(sCol, edge.from, edge.to, edge.targetColumn);
    check(tCol, edge.to, edge.from, edge.sourceColumn);
  }

  // fk columns no edge draws — the docs would silently omit the relation
  for (const node of nodes.values()) {
    for (const col of node.table?.columns ?? []) {
      if (!col.fk) continue;
      const covered = model.edges.some(
        (e) =>
          (e.from === node.path && e.sourceColumn === col.name) ||
          (e.to === node.path && e.targetColumn === col.name),
      );
      if (!covered)
        warn(
          `${tableId(node.path)}.${col.name} declares fk -> ${col.fk.table}.${col.fk.column} but no edge draws it`,
          node.site,
        );
    }
  }

  return issues;
}
