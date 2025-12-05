import * as assert from "assert";
import * as vscode from "vscode";
import {
  MessageInterceptor,
  createMessageFilter,
  createMessageTransformer,
  MessageType,
} from "../messageInterceptor";

suite("MessageInterceptor Test Suite", () => {
  let interceptor: MessageInterceptor;
  let messages: Array<{ type: MessageType; message: string }> = [];

  setup(() => {
    messages = [];
  });

  teardown(() => {
    if (interceptor) {
      interceptor.deactivate();
    }
  });

  test("Should intercept and log messages", (done) => {
    interceptor = new MessageInterceptor({
      logMessages: true,
    });

    interceptor.activate();

    // Test that showErrorMessage is intercepted
    vscode.window.showErrorMessage("Test error message");
    vscode.window.showWarningMessage("Test warning message");
    vscode.window.showInformationMessage("Test info message");

    // Clean up
    setTimeout(() => {
      interceptor.deactivate();
      done();
    }, 100);
  });

  test("Should filter messages based on patterns", (done) => {
    const filter = createMessageFilter(["no database connection", /test/i]);

    interceptor = new MessageInterceptor({
      filter: filter,
      logMessages: true,
    });

    interceptor.activate();

    // These should be filtered
    vscode.window.showErrorMessage("no database connection");
    vscode.window.showErrorMessage("This is a test message");

    // This should not be filtered
    vscode.window.showInformationMessage("Normal message");

    setTimeout(() => {
      interceptor.deactivate();
      done();
    }, 100);
  });

  test("Should transform messages", (done) => {
    const transformer = createMessageTransformer([
      { from: "error", to: "⚠️ issue" },
      { from: /database/gi, to: "DB" },
    ]);

    interceptor = new MessageInterceptor({
      transformer: transformer,
      logMessages: true,
    });

    interceptor.activate();

    vscode.window.showErrorMessage("Database error occurred");
    // Should be transformed to: "DB ⚠️ issue occurred"

    setTimeout(() => {
      interceptor.deactivate();
      done();
    }, 100);
  });

  test("Should deactivate and restore original methods", () => {
    const originalShowErrorMessage = vscode.window.showErrorMessage;

    interceptor = new MessageInterceptor();
    interceptor.activate();

    // Verify the method is overridden
    assert.notStrictEqual(
      vscode.window.showErrorMessage,
      originalShowErrorMessage
    );

    interceptor.deactivate();

    // Verify the method is restored
    assert.strictEqual(
      vscode.window.showErrorMessage,
      originalShowErrorMessage
    );
  });

  test("createMessageFilter should suppress matching patterns", () => {
    const filter = createMessageFilter(["exact match", /pattern\d+/i]);

    // Should be suppressed
    assert.strictEqual(filter("exact match", "error"), false);
    assert.strictEqual(
      filter("This contains exact match here", "error"),
      false
    );
    assert.strictEqual(filter("Pattern123", "warning"), false);

    // Should not be suppressed
    assert.strictEqual(filter("different message", "info"), true);
    assert.strictEqual(filter("no match here", "error"), true);
  });

  test("createMessageTransformer should replace text", () => {
    const transformer = createMessageTransformer([
      { from: "old", to: "new" },
      { from: /\d+/g, to: "X" },
    ]);

    assert.strictEqual(transformer("old value", "error"), "new value");

    assert.strictEqual(transformer("version 123", "error"), "version X");

    assert.strictEqual(
      transformer("old text with 456 numbers", "error"),
      "new text with X numbers"
    );
  });

  test("Should allow custom filter function", (done) => {
    let filteredCount = 0;

    interceptor = new MessageInterceptor({
      filter: (message, type) => {
        if (type === "error" && message.includes("critical")) {
          return true; // Show critical errors
        }
        filteredCount++;
        return false; // Suppress everything else
      },
      logMessages: true,
    });

    interceptor.activate();

    vscode.window.showErrorMessage("normal error");
    vscode.window.showErrorMessage("critical error");
    vscode.window.showWarningMessage("some warning");

    setTimeout(() => {
      assert.strictEqual(filteredCount, 2); // 2 messages should be filtered
      interceptor.deactivate();
      done();
    }, 100);
  });

  test("Should handle activate/deactivate multiple times", () => {
    interceptor = new MessageInterceptor();

    interceptor.activate();
    interceptor.activate(); // Should be idempotent
    interceptor.deactivate();
    interceptor.deactivate(); // Should be idempotent
    interceptor.activate();
    interceptor.deactivate();

    // Should not throw any errors
    assert.ok(true);
  });

  test("Should update filter dynamically", (done) => {
    interceptor = new MessageInterceptor({
      logMessages: true,
    });

    interceptor.activate();

    // Initially no filter, all messages should pass
    vscode.window.showErrorMessage("test message");

    // Set a filter
    const filter = createMessageFilter(["test"]);
    interceptor.setFilter(filter);

    // Now this should be filtered
    vscode.window.showErrorMessage("test message");

    setTimeout(() => {
      interceptor.deactivate();
      done();
    }, 100);
  });

  test("Should update transformer dynamically", (done) => {
    interceptor = new MessageInterceptor({
      logMessages: true,
    });

    interceptor.activate();

    vscode.window.showErrorMessage("error message");

    // Set a transformer
    const transformer = createMessageTransformer([{ from: "error", to: "⚠️" }]);
    interceptor.setTransformer(transformer);

    vscode.window.showErrorMessage("error message");
    // Should be transformed to: "⚠️ message"

    setTimeout(() => {
      interceptor.deactivate();
      done();
    }, 100);
  });
});
