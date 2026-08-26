import type { ReactNode } from "react";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderValue(value: unknown, path: string): ReactNode {
  if (value === null) {
    return <span className="json-null">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="json-bool">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="json-number">{value}</span>;
  }
  if (typeof value === "string") {
    return <span className="json-string">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="muted">[]</span>;
    }
    return (
      <ul className="json-array">
        {value.map((entry, index) => (
          <li key={`${path}[${index}]`}>
            <span className="json-index">{index}</span>
            {renderValue(entry, `${path}[${index}]`)}
          </li>
        ))}
      </ul>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="muted">{"{}"}</span>;
    }
    return (
      <dl className="json-object">
        {entries.map(([key, child]) => (
          <div key={`${path}.${key}`} className="json-entry">
            <dt>{key}</dt>
            <dd>{renderValue(child, `${path}.${key}`)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="muted">Unsupported value</span>;
}

/**
 * Safe payload renderer — never uses dangerouslySetInnerHTML.
 */
export function SafeJsonPayload({
  payload,
}: {
  payload: Record<string, unknown> | JsonValue;
}) {
  return (
    <div className="safe-json-payload" aria-label="Artifact payload">
      {renderValue(payload, "$")}
    </div>
  );
}
