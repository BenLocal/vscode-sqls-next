import { parseAsciiTableResult, parseResultSmart, isAsciiTable } from "./resultParser";

// Test data
const testAsciiTable = `+----+------+-----+--------+--------+-------------+
| ID | NAME | AGE | SWITCH |  1TO1  | CREATE TIME |
+----+------+-----+--------+--------+-------------+
|  1 | aaa  |   3 |        | shiben | <nil>       |
+----+------+-----+--------+--------+-------------+
1 rows in set


`;

const testMultiRowTable = `+----+-------+-----+
| ID | NAME  | AGE |
+----+-------+-----+
|  1 | Alice |  25 |
|  2 | Bob   |  30 |
|  3 | Carol |  28 |
+----+-------+-----+
3 rows in set
`;

// Test parseAsciiTableResult
console.log("=== Test 1: Parse single row ASCII table ===");
try {
  const result = parseAsciiTableResult(testAsciiTable);
  console.log("Columns:", result.columns);
  console.log("Rows:", result.rows);
  console.log("Rows affected:", result.rowsAffected);
  console.log("✓ Test 1 passed\n");
} catch (error) {
  console.error("✗ Test 1 failed:", error);
}

// Test parseAsciiTableResult with multiple rows
console.log("=== Test 2: Parse multi-row ASCII table ===");
try {
  const result = parseAsciiTableResult(testMultiRowTable);
  console.log("Columns:", result.columns);
  console.log("Rows:", result.rows);
  console.log("Rows affected:", result.rowsAffected);
  console.log("✓ Test 2 passed\n");
} catch (error) {
  console.error("✗ Test 2 failed:", error);
}

// Test parseResultSmart with ASCII table
console.log("=== Test 3: parseResultSmart with ASCII table ===");
try {
  const result = parseResultSmart(testAsciiTable);
  console.log("Result:", result);
  console.log("✓ Test 3 passed\n");
} catch (error) {
  console.error("✗ Test 3 failed:", error);
}

// Test parseResultSmart with JSON object
console.log("=== Test 4: parseResultSmart with JSON object ===");
try {
  const jsonResult = {
    columns: [{ name: "id" }, { name: "name" }],
    rows: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
  };
  const result = parseResultSmart(jsonResult);
  console.log("Result:", result);
  console.log("✓ Test 4 passed\n");
} catch (error) {
  console.error("✗ Test 4 failed:", error);
}

// Test parseResultSmart with array
console.log("=== Test 5: parseResultSmart with array ===");
try {
  const arrayResult = [
    { id: 1, name: "Alice", age: 25 },
    { id: 2, name: "Bob", age: 30 },
  ];
  const result = parseResultSmart(arrayResult);
  console.log("Result:", result);
  console.log("✓ Test 5 passed\n");
} catch (error) {
  console.error("✗ Test 5 failed:", error);
}

// Test isAsciiTable
console.log("=== Test 6: isAsciiTable detection ===");
console.log("Is ASCII table (valid):", isAsciiTable(testAsciiTable));
console.log("Is ASCII table (JSON):", isAsciiTable(JSON.stringify({ test: "data" })));
console.log("Is ASCII table (plain text):", isAsciiTable("Hello world"));
console.log("✓ Test 6 passed\n");

// Test with NULL values
console.log("=== Test 7: Handle NULL values ===");
const tableWithNulls = `+----+-------+-------+
| ID | NAME  | EMAIL |
+----+-------+-------+
|  1 | Alice | <nil> |
|  2 |       | bob@  |
+----+-------+-------+
`;
try {
  const result = parseAsciiTableResult(tableWithNulls);
  console.log("Result:", result);
  console.log("NULL handling:", result.rows[0].EMAIL === null ? "✓" : "✗");
  console.log("Empty string handling:", result.rows[1].NAME === null ? "✓" : "✗");
  console.log("✓ Test 7 passed\n");
} catch (error) {
  console.error("✗ Test 7 failed:", error);
}

console.log("=== All tests completed ===");

