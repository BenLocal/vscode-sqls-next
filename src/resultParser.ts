import { QueryResult } from "./resultPanel";

/**
 * Parse JSON format result to QueryResult
 * Supported formats:
 * 1. { "columns": ["col1", "col2"], "rows": [["val1", "val2"], ...] }
 * 2. {"rows_affected": 1} - for INSERT/UPDATE/DELETE operations
 */
export function parseJsonResult(jsonData: any): QueryResult {
  if (!jsonData || typeof jsonData !== "object") {
    throw new Error("Invalid JSON data input");
  }

  // Handle rows_affected format (for INSERT/UPDATE/DELETE operations)
  if ("rows_affected" in jsonData && typeof jsonData.rows_affected === "number") {
    return {
      columns: [{ name: "rows_affected" }],
      rows: [{ rows_affected: jsonData.rows_affected }],
      rowsAffected: jsonData.rows_affected,
    };
  }

  // Handle format with columns and rows
  if ("columns" in jsonData && "rows" in jsonData) {
    // Check if it has the expected format with columns and rows
    if (!Array.isArray(jsonData.columns) || !Array.isArray(jsonData.rows)) {
      throw new Error("JSON data must have 'columns' and 'rows' arrays");
    }

    const columnNames = jsonData.columns;
    if (columnNames.length === 0) {
      throw new Error("No columns found in JSON data");
    }

    // Create columns array
    const columns = columnNames.map((name: string) => ({ name: String(name) }));

    // Parse rows: convert array of arrays to array of objects
    const rows: Array<Record<string, any>> = jsonData.rows.map((row: any[]) => {
      const rowObj: Record<string, any> = {};
      columnNames.forEach((colName: string, index: number) => {
        let value = row[index];
        // Handle special values
        if (value === "null" || value === null || value === undefined || value === "<nil>") {
          value = null;
        }
        rowObj[colName] = value;
      });
      return rowObj;
    });

    return {
      columns,
      rows,
      rowsAffected: rows.length,
    };
  }

  // If format is not recognized, throw error
  throw new Error(
    "JSON data must have either 'columns' and 'rows' arrays, or 'rows_affected' number"
  );
}

/**
 * Smart parser that handles various result formats
 * Supports:
 * - JSON string
 * - JSON object
 * - Already parsed QueryResult
 */
export function parseResultSmart(result: any): QueryResult {
  // If already in correct format, return as is
  if (result && typeof result === "object" && result.columns && result.rows) {
    // Check if rows are objects (already in correct format) or arrays (need conversion)
    if (Array.isArray(result.rows) && result.rows.length > 0) {
      // If first row is an array, parse as JSON format
      if (Array.isArray(result.rows[0])) {
        try {
          return parseJsonResult(result);
        } catch (error) {
          console.error("Failed to parse JSON result:", error);
        }
      }
      // If first row is an object, it's already in the correct format
      if (typeof result.rows[0] === "object" && !Array.isArray(result.rows[0])) {
        return result as QueryResult;
      }
    }
  }

  // Try to parse as JSON string
  if (typeof result === "string") {
    try {
      const jsonData = JSON.parse(result);
      return parseJsonResult(jsonData);
    } catch (e) {
      // Not valid JSON, return as single column result
      return {
        columns: [{ name: "result" }],
        rows: [{ result: result }],
      };
    }
  }

  // Try to parse as object directly
  if (typeof result === "object" && result !== null) {
    try {
      return parseJsonResult(result);
    } catch (error) {
      console.error("Failed to parse result:", error);
    }
  }

  // Fallback: return as single column result
  return {
    columns: [{ name: "result" }],
    rows: [{ result: JSON.stringify(result) }],
  };
}


