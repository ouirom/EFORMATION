// Translates the T-SQL text used throughout the query layer into PostgreSQL-compatible
// SQL. Only invoked when DB_CLIENT=postgres; the mssql path sends queries unchanged.

// Columns stored as BIT in SQL Server but BOOLEAN in the Postgres schema, so literal
// `= 1` / `= 0` comparisons against them need to become `= true` / `= false`.
const BOOLEAN_COLUMNS = ['is_active', 'is_published', 'is_correct', 'randomized', 'consented'];

function translateBooleanLiterals(text: string): string {
  let result = text;
  for (const col of BOOLEAN_COLUMNS) {
    result = result.replace(new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'g'), `${col} = true`);
    result = result.replace(new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'g'), `${col} = false`);
  }
  return result;
}

// JSON_VALUE(expr, '$.key') -> (expr->>'key'); OPENJSON(expr, '$.key') -> a Postgres
// set-returning equivalent aliased as "value" to match SQL Server's default column name.
function translateJsonFunctions(text: string): string {
  let result = text;
  result = result.replace(/@(\w+)(\s+IN\s*\(\s*SELECT\s+value\s+FROM\s+OPENJSON)/gi, '@$1::text$2');
  result = result.replace(
    /\bOPENJSON\(([^,]+),\s*'\$\.(\w+)'\)/gi,
    (_match, expr: string, key: string) => `jsonb_array_elements_text(${expr.trim()}->'${key}') AS value`
  );
  result = result.replace(
    /\bJSON_VALUE\(([^,]+),\s*'\$\.(\w+)'\)/gi,
    (_match, expr: string, key: string) => `(${expr.trim()}->>'${key}')`
  );
  // A JSON_VALUE text extraction compared numerically needs an explicit cast.
  result = result.replace(/(\([^()]+->>'[^']+'\))\s*(<=|>=|<|>)\s*@(\w+)/g, '$1::numeric $2 @$3');
  return result;
}

function translateOutputInserted(text: string): string {
  const columns: string[] = [];
  const withoutOutput = text.replace(/\bOUTPUT\s+INSERTED\.(\w+)\b/gi, (_match, col: string) => {
    columns.push(col);
    return '';
  });
  if (columns.length === 0) return text;
  return `${withoutOutput.trimEnd()} RETURNING ${columns.join(', ')}`;
}

// Handles both `(SELECT TOP n ...)` correlated subqueries (LIMIT goes before the
// closing paren) and a single top-level `SELECT TOP n ...` (LIMIT goes at the end).
// Queries with more than one top-level TOP (e.g. UNION branches) are not rewritten
// here — those must be restructured at the call site with a single outer TOP/LIMIT.
function translateTopToLimit(text: string): string {
  let result = text;
  const topLevelMatches: number[] = [];

  for (;;) {
    const match = /\bSELECT\s+TOP\s+(\d+)\s+/i.exec(result);
    if (!match || match.index === undefined) break;

    const n = match[1];
    const selectStart = match.index;
    const matchEnd = selectStart + match[0].length;
    const withoutTop = result.slice(0, selectStart) + 'SELECT ' + result.slice(matchEnd);

    let i = selectStart - 1;
    while (i >= 0 && /\s/.test(result[i])) i--;

    if (result[i] === '(') {
      let depth = 0;
      let j = i;
      for (; j < withoutTop.length; j++) {
        if (withoutTop[j] === '(') depth++;
        else if (withoutTop[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      result = withoutTop.slice(0, j) + ` LIMIT ${n} ` + withoutTop.slice(j);
    } else {
      topLevelMatches.push(Number(n));
      if (topLevelMatches.length > 1) {
        // Ambiguous: more than one top-level TOP in the same statement. Bail out
        // rather than emit invalid SQL — the query must be restructured upstream.
        throw new Error(
          `Cannot translate multiple top-level TOP clauses in one statement for PostgreSQL: ${text.slice(0, 120)}...`
        );
      }
      result = `${withoutTop.trimEnd()} LIMIT ${n}`;
    }
  }

  return result;
}

function translateNamedParams(text: string, params?: Record<string, any>): { text: string; values: any[] } {
  const values: any[] = [];
  const positions = new Map<string, number>();

  const translated = text.replace(/@(\w+)/g, (_match, name: string) => {
    if (positions.has(name)) {
      return `$${positions.get(name)}`;
    }
    let value = params ? params[name] : undefined;
    // Mirror the mssql driver's behavior of storing plain objects/arrays as JSON text.
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      value = JSON.stringify(value);
    }
    values.push(value);
    const position = values.length;
    positions.set(name, position);
    return `$${position}`;
  });

  return { text: translated, values };
}

export function translateForPostgres(
  queryText: string,
  params?: Record<string, any>
): { text: string; values: any[] } {
  let text = queryText;
  text = text.replace(/\bGETDATE\(\)/gi, 'NOW()');
  text = text.replace(/\bSYSUTCDATETIME\(\)/gi, 'NOW()');
  text = text.replace(/\bISNULL\(/gi, 'COALESCE(');
  text = translateJsonFunctions(text);
  text = translateBooleanLiterals(text);
  text = translateTopToLimit(text);
  text = translateOutputInserted(text);
  return translateNamedParams(text, params);
}
