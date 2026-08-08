"use strict";
// Translates the T-SQL text used throughout the query layer into PostgreSQL-compatible
// SQL. Only invoked when DB_CLIENT=postgres; the mssql path sends queries unchanged.
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateForPostgres = translateForPostgres;
// Columns stored as BIT in SQL Server but BOOLEAN in the Postgres schema, so literal
// `= 1` / `= 0` comparisons against them need to become `= true` / `= false`.
const BOOLEAN_COLUMNS = ['is_active', 'is_published', 'is_correct', 'randomized', 'consented', 'passed'];
function translateBooleanLiterals(text) {
    let result = text;
    for (const col of BOOLEAN_COLUMNS) {
        result = result.replace(new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'g'), `${col} = true`);
        result = result.replace(new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'g'), `${col} = false`);
    }
    return result;
}
function splitTopLevelArgs(argsText) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of argsText) {
        if (ch === '(')
            depth++;
        if (ch === ')')
            depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        }
        else {
            current += ch;
        }
    }
    parts.push(current.trim());
    return parts;
}
// Replaces every balanced `funcName(...)` call with transform(args), correctly handling
// nested parens/commas in the arguments (unlike a plain non-nesting regex).
function replaceBalancedCall(text, funcName, transform) {
    let result = text;
    const re = new RegExp(`\\b${funcName}\\s*\\(`, 'i');
    for (;;) {
        const match = re.exec(result);
        if (!match || match.index === undefined)
            break;
        const openParen = match.index + match[0].length - 1;
        let depth = 0;
        let i = openParen;
        for (; i < result.length; i++) {
            if (result[i] === '(')
                depth++;
            else if (result[i] === ')') {
                depth--;
                if (depth === 0)
                    break;
            }
        }
        const args = splitTopLevelArgs(result.slice(openParen + 1, i));
        const replacement = transform(args);
        result = result.slice(0, match.index) + replacement + result.slice(i + 1);
    }
    return result;
}
// GETUTCDATE() -> NOW(); DATEADD(day, n, expr) -> expr +/- INTERVAL; DATEDIFF(day, a, b) ->
// integer day difference. Only the "day" unit is used anywhere in this codebase.
function translateDateFunctions(text) {
    let result = replaceBalancedCall(text, 'GETUTCDATE', () => 'NOW()');
    result = replaceBalancedCall(result, 'DATEADD', (args) => {
        const [unit, amount, expr] = args;
        return `(${expr} + INTERVAL '${amount} ${unit.trim().toLowerCase()}s')`;
    });
    result = replaceBalancedCall(result, 'DATEDIFF', (args) => {
        const [unit, start, end] = args;
        if (unit.trim().toLowerCase() === 'day') {
            return `((${end})::date - (${start})::date)`;
        }
        return `EXTRACT(EPOCH FROM ((${end}) - (${start})))`;
    });
    result = replaceBalancedCall(result, 'DATEPART', (args) => {
        const [unit, expr] = args;
        return `EXTRACT(${unit.trim().toUpperCase()} FROM ${expr})::int`;
    });
    return result;
}
// JSON_VALUE(expr, '$.key') -> (expr->>'key'); OPENJSON(expr, '$.key') -> a Postgres
// set-returning equivalent aliased as "value" to match SQL Server's default column name.
function translateJsonFunctions(text) {
    let result = text;
    result = result.replace(/@(\w+)(\s+IN\s*\(\s*SELECT\s+value\s+FROM\s+OPENJSON)/gi, '@$1::text$2');
    result = result.replace(/\bOPENJSON\(([^,]+),\s*'\$\.(\w+)'\)/gi, (_match, expr, key) => `jsonb_array_elements_text(${expr.trim()}->'${key}') AS value`);
    result = result.replace(/\bJSON_VALUE\(([^,]+),\s*'\$\.(\w+)'\)/gi, (_match, expr, key) => `(${expr.trim()}->>'${key}')`);
    // A JSON_VALUE text extraction compared numerically needs an explicit cast.
    result = result.replace(/(\([^()]+->>'[^']+'\))\s*(<=|>=|<|>)\s*@(\w+)/g, '$1::numeric $2 @$3');
    return result;
}
function translateOutputInserted(text) {
    const columns = [];
    const withoutOutput = text.replace(/\bOUTPUT\s+INSERTED\.(\w+)\b/gi, (_match, col) => {
        columns.push(col);
        return '';
    });
    if (columns.length === 0)
        return text;
    return `${withoutOutput.trimEnd()} RETURNING ${columns.join(', ')}`;
}
// Handles both `(SELECT TOP n ...)` correlated subqueries (LIMIT goes before the
// closing paren) and a single top-level `SELECT TOP n ...` (LIMIT goes at the end).
// `TOP n` and the parameterized `TOP (@param)` are both supported. Queries with more
// than one top-level TOP (e.g. UNION branches) are not rewritten here — those must be
// restructured at the call site with a single outer TOP/LIMIT.
function translateTopToLimit(text) {
    let result = text;
    const topLevelMatches = [];
    for (;;) {
        const match = /\bSELECT\s+TOP\s+(?:(\d+)|\(\s*@(\w+)\s*\))\s+/i.exec(result);
        if (!match || match.index === undefined)
            break;
        const n = match[1] !== undefined ? match[1] : `@${match[2]}`;
        const selectStart = match.index;
        const matchEnd = selectStart + match[0].length;
        const withoutTop = result.slice(0, selectStart) + 'SELECT ' + result.slice(matchEnd);
        let i = selectStart - 1;
        while (i >= 0 && /\s/.test(result[i]))
            i--;
        if (result[i] === '(') {
            let depth = 0;
            let j = i;
            for (; j < withoutTop.length; j++) {
                if (withoutTop[j] === '(')
                    depth++;
                else if (withoutTop[j] === ')') {
                    depth--;
                    if (depth === 0)
                        break;
                }
            }
            result = withoutTop.slice(0, j) + ` LIMIT ${n} ` + withoutTop.slice(j);
        }
        else {
            topLevelMatches.push(n);
            if (topLevelMatches.length > 1) {
                // Ambiguous: more than one top-level TOP in the same statement. Bail out
                // rather than emit invalid SQL — the query must be restructured upstream.
                throw new Error(`Cannot translate multiple top-level TOP clauses in one statement for PostgreSQL: ${text.slice(0, 120)}...`);
            }
            result = `${withoutTop.trimEnd()} LIMIT ${n}`;
        }
    }
    return result;
}
function translateNamedParams(text, params) {
    const values = [];
    const positions = new Map();
    const translated = text.replace(/@(\w+)/g, (_match, name) => {
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
function translateForPostgres(queryText, params) {
    let text = queryText;
    text = text.replace(/\bGETDATE\(\)/gi, 'NOW()');
    text = text.replace(/\bSYSUTCDATETIME\(\)/gi, 'NOW()');
    text = text.replace(/\bISNULL\(/gi, 'COALESCE(');
    text = translateDateFunctions(text);
    text = translateJsonFunctions(text);
    text = translateBooleanLiterals(text);
    text = translateTopToLimit(text);
    text = translateOutputInserted(text);
    return translateNamedParams(text, params);
}
//# sourceMappingURL=sql-dialect.js.map