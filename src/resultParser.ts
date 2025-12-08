import { QueryResult } from "./resultPanel";

/**
 * Parse ASCII table format result to QueryResult
 * Example input:
 * +----+------+-----+--------+--------+-------------+
 * | ID | NAME | AGE | SWITCH |  1TO1  | CREATE TIME |
 * +----+------+-----+--------+--------+-------------+
 * |  1 | aaa  |   3 |        | shiben | <nil>       |
 * +----+------+-----+--------+--------+-------------+
 * 1 rows in set
 */
export function parseAsciiTableResult(asciiTable: string): QueryResult {
  if (!asciiTable || typeof asciiTable !== "string") {
    throw new Error("Invalid ASCII table input");
  }

  const lines = asciiTable.split("\n").filter((line) => line.trim());

  // Find header line (contains column names)
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Header line starts with | and contains letters
    if (line.startsWith("|") && /[A-Za-z]/.test(line)) {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    throw new Error("Could not find header line in ASCII table");
  }

  // Parse column names from header
  const headerLine = lines[headerLineIndex];
  const columnNames = headerLine
    .split("|")
    .slice(1, -1) // Remove first and last empty strings
    .map((col) => col.trim())
    .filter((col) => col.length > 0);

  if (columnNames.length === 0) {
    throw new Error("No columns found in header");
  }

  // Create columns array
  const columns = columnNames.map((name) => ({ name }));

  // Parse data rows
  const rows: Array<Record<string, any>> = [];

  // Find data lines (start with | and come after header, before separator)
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator lines (start with +)
    if (line.startsWith("+")) {
      continue;
    }

    // Skip summary lines (e.g., "1 rows in set")
    if (!line.startsWith("|")) {
      break;
    }

    // Parse data row
    const values = line
      .split("|")
      .slice(1, -1) // Remove first and last empty strings
      .map((val) => val.trim());

    if (values.length === columnNames.length) {
      const row: Record<string, any> = {};

      columnNames.forEach((colName, index) => {
        let value: any = values[index];

        // Handle special values
        if (value === "<nil>" || value === "NULL" || value === "") {
          value = null;
        }

        row[colName] = value;
      });

      rows.push(row);
    }
  }

  return {
    columns,
    rows,
    rowsAffected: rows.length,
  };
}

/**
 * Try to parse result as ASCII table, if fails return original result
 */
export function parseResultSmart(result: any): QueryResult {
  // If already in correct format, return as is
  if (result && typeof result === "object" && result.columns && result.rows) {
    return result as QueryResult;
  }

  // If it's a string that looks like an ASCII table, parse it
  if (typeof result === "string" && result.includes("+--") && result.includes("|")) {
    try {
      return parseAsciiTableResult(result);
    } catch (error) {
      console.error("Failed to parse ASCII table:", error);
      // Return a simple result with the raw string
      return {
        columns: [{ name: "result" }],
        rows: [{ result: result }],
      };
    }
  }

  // Try to handle other formats
  if (Array.isArray(result)) {
    // If it's an array of objects, convert to QueryResult
    if (result.length > 0 && typeof result[0] === "object") {
      const columns = Object.keys(result[0]).map((name) => ({ name }));
      return {
        columns,
        rows: result,
        rowsAffected: result.length,
      };
    }
  }

  // Fallback: return as single column result
  return {
    columns: [{ name: "result" }],
    rows: [{ result: JSON.stringify(result) }],
  };
}

/**
 * Detect if a string is an ASCII table format
 */
export function isAsciiTable(str: string): boolean {
  if (typeof str !== "string") {
    return false;
  }

  // Check for table markers
  const hasTableBorder = str.includes("+--") || str.includes("+==");
  const hasColumnSeparator = str.includes("|");
  const hasNewlines = str.includes("\n");

  return hasTableBorder && hasColumnSeparator && hasNewlines;
}

