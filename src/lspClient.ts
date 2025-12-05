import path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

import * as lsp from "vscode-languageclient/node";
import { DidChangeConfigurationParams, InitializeOptions } from "./lspTypes";
import { ResultPanel } from "./resultPanel";
import { parseResultSmart } from "./resultParser";

export class SqlsClient {
  private readonly _context: vscode.ExtensionContext;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _resultPanel: ResultPanel | undefined;

  private _client: lsp.LanguageClient | undefined;
  private _state: boolean = false;
  private _restartCount: number = 0;
  private readonly _maxRestartAttempts: number = 5;

  // Helper to check if error is "command not found"
  private isCommandNotFound(errorMsg: string): boolean {
    return (
      errorMsg.includes("not found") || errorMsg.includes("Unknown command")
    );
  }

  // Helper to forward command to language server
  private async forwardCommandToServer(
    command: string,
    args?: any[]
  ): Promise<any> {
    if (!this._client || !this._state) {
      throw new Error("Language server not available");
    }

    const params: lsp.ExecuteCommandParams = {
      command: command,
      arguments: args || [],
    };

    return this._client.sendRequest("workspace/executeCommand", params);
  }

  constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    resultPanel: ResultPanel
  ) {
    this._context = context;
    this._outputChannel = outputChannel;
    this._resultPanel = resultPanel;
  }

  private createLanguageClient(
    initializeOptions: InitializeOptions
  ): lsp.LanguageClient {
    const ext = process.platform === "win32" ? ".exe" : "";
    const perfix = process.platform === "win32" ? ".\\" : "./";
    const base = this.getBasePath();
    const cwd = path.join(this._context.extensionPath, "resources", base);
    const sqls = `sqls${ext}`;

    // Check if sqls executable exists
    if (!fs.existsSync(path.join(cwd, sqls))) {
      const errorMsg = `sqls executable not found at: ${sqls}`;
      this._outputChannel.appendLine(errorMsg);
      vscode.window.showErrorMessage(
        `sqls-next: ${errorMsg}. Please ensure the sqls binary is installed.`
      );
      throw new Error(errorMsg);
    }

    const run: lsp.Executable = {
      command: `${perfix}${sqls}`,
      options: {
        env: {
          ...process.env,
        },
        cwd: cwd,
      },
      args: ["-t"],
      // sqls has no -stdio option, so we use the default transport
      // transport: lsp.TransportKind.stdio,
    };
    const serverOptions: lsp.ServerOptions = {
      run: run,
      debug: run,
    };
    const clientOptions: lsp.LanguageClientOptions = {
      documentSelector: [{ scheme: "file", language: "sql" }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher("**/*.sql"),
      },
      traceOutputChannel: this._outputChannel,
      errorHandler: {
        error: (error, message, count = 0) => {
          const errorCount = count ?? 0;
          this._outputChannel.appendLine(
            `Language server error: ${error.message} (count: ${errorCount})`
          );
          if (errorCount <= 3) {
            return { action: lsp.ErrorAction.Continue };
          }
          vscode.window.showErrorMessage(
            `sqls-next: Language server connection error: ${error.message}`
          );
          return { action: lsp.ErrorAction.Shutdown };
        },
        closed: () => {
          this._outputChannel.appendLine("Language server connection closed");
          this._state = false;

          // Check if we should restart
          if (this._restartCount >= this._maxRestartAttempts) {
            this._outputChannel.appendLine(
              `Maximum restart attempts (${this._maxRestartAttempts}) reached. Server will not restart.`
            );
            vscode.window.showErrorMessage(
              `sqls-next: Language server has been restarted ${this._maxRestartAttempts} times. Please check the server configuration.`
            );
            return { action: lsp.CloseAction.DoNotRestart };
          }

          this._restartCount++;
          this._outputChannel.appendLine(
            `Restarting language server (attempt ${this._restartCount}/${this._maxRestartAttempts})...`
          );
          return { action: lsp.CloseAction.Restart };
        },
      },
      progressOnInitialization: true,
      initializationOptions: initializeOptions,
      initializationFailedHandler: (error) => {
        this._outputChannel.appendLine(
          `Language server initialization failed: ${error.message}`
        );
        return false;
      },
      middleware: {
        // CodeLens support for sqls
        provideCodeLenses: (document, token, next) => {
          this._outputChannel.appendLine(
            `[CodeLens] Requesting CodeLenses for ${document.uri.toString()}`
          );
          try {
            const result = next(document, token);
            if (result instanceof Promise) {
              return result
                .then((codeLenses) => {
                  this._outputChannel.appendLine(
                    `[CodeLens] Received ${codeLenses?.length || 0} CodeLenses`
                  );
                  return codeLenses;
                })
                .catch((error) => {
                  this._outputChannel.appendLine(
                    `[CodeLens] Error: ${error.message || error}`
                  );
                  throw error;
                });
            }
            return result;
          } catch (error) {
            this._outputChannel.appendLine(
              `[CodeLens] Exception: ${error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          }
        },
        resolveCodeLens: (codeLens, token, next) => {
          this._outputChannel.appendLine(
            `[CodeLens] Resolving CodeLens at line ${codeLens.range.start.line}`
          );
          try {
            return next(codeLens, token);
          } catch (error) {
            this._outputChannel.appendLine(
              `[CodeLens] Resolve error: ${error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          }
        },
        // CodeAction support for sqls
        provideCodeActions: (document, range, context, token, next) => {
          this._outputChannel.appendLine(
            `[CodeAction] Requesting CodeActions for ${document.uri.toString()} at range ${range.start.line
            }:${range.start.character}-${range.end.line}:${range.end.character}`
          );
          this._outputChannel.appendLine(
            `[CodeAction] Context: ${context.diagnostics.length
            } diagnostics, only=${context.only?.value || "all"}`
          );
          try {
            const result = next(document, range, context, token);
            if (result instanceof Promise) {
              return result
                .then((codeActions: vscode.CodeAction[] | null | undefined) => {
                  this._outputChannel.appendLine(
                    `[CodeAction] Received ${codeActions?.length || 0
                    } CodeActions`
                  );
                  if (codeActions && codeActions.length > 0) {
                    codeActions.forEach(
                      (action: vscode.CodeAction, index: number) => {
                        this._outputChannel.appendLine(
                          `[CodeAction] ${index + 1}. ${action.title} (kind: ${action.kind?.value || "none"
                          })`
                        );
                      }
                    );
                  }
                  return codeActions;
                })
                .catch((error) => {
                  this._outputChannel.appendLine(
                    `[CodeAction] Error: ${error.message || error}`
                  );
                  throw error;
                });
            }
            return result;
          } catch (error) {
            this._outputChannel.appendLine(
              `[CodeAction] Exception: ${error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          }
        },
        resolveCodeAction: (codeAction, token, next) => {
          this._outputChannel.appendLine(
            `[CodeAction] Resolving CodeAction: ${codeAction.title}`
          );
          try {
            // If the CodeAction has a command, we need to ensure it can be executed
            // Server-side commands will be handled by the command handler in extension.ts
            if (codeAction.command) {
              this._outputChannel.appendLine(
                `[CodeAction] CodeAction has command: ${codeAction.command.command}`
              );
            }
            return next(codeAction, token);
          } catch (error) {
            this._outputChannel.appendLine(
              `[CodeAction] Resolve error: ${error instanceof Error ? error.message : String(error)
              }`
            );
            throw error;
          }
        },
        // Handle workspace/executeCommand requests from the language server
        // Also handles commands from CodeAction and CodeLens
        executeCommand: async (command, args, next) => {
          this._outputChannel.appendLine(
            `[ExecuteCommand] Requested to execute command: ${command}`
          );
          if (args && args.length > 0) {
            this._outputChannel.appendLine(
              `[ExecuteCommand] Arguments: ${JSON.stringify(args)}`
            );
          }

          if (command === "executeQuery") {
            await this._resultPanel?.displayLoading();
          }

          // Try to execute the command using VS Code's command system
          // If it fails (command not found), forward it to the language server
          try {
            const result = await next(command, args);
            this._outputChannel.appendLine(
              `[ExecuteCommand] Command executed successfully via VS Code: ${command}`
            );
            if (command === "executeQuery") {
              // Parse and display result
              const parsedResult = parseResultSmart(result);
              this._resultPanel?.displayResults(parsedResult);
            }
            return result;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);

            if (this.isCommandNotFound(errorMsg)) {
              this._outputChannel.appendLine(
                `[ExecuteCommand] Command not found in VS Code, forwarding to language server: ${command}`
              );
              return this.forwardCommandToServer(command, args);
            }

            this._outputChannel.appendLine(
              `[ExecuteCommand] Error executing command ${command}: ${errorMsg}`
            );
            await this._resultPanel?.displayError(errorMsg);
            throw error;
          }
        },
      },
    };
    return new lsp.LanguageClient(
      "sqls-next",
      "Sqls Next",
      serverOptions,
      clientOptions
    );
  }

  private getBasePath(): string {
    let arch = "amd64";
    if (process.arch === "arm64") {
      arch = "arm64";
    }

    let os = "linux";
    if (process.platform === "win32") {
      os = "win";
    } else if (process.platform === "darwin") {
      os = "darwin";
    }

    return `${os}_${arch}`;
  }

  async startServer(initializeOptions: InitializeOptions) {
    if (this._state) {
      this._outputChannel.appendLine("Server is already started");
      return;
    }

    if (!this._client) {
      this._client = this.createLanguageClient(initializeOptions);
      this._client.onDidChangeState((event) => {
        this._outputChannel.appendLine(
          `Language server state changed to: ${event.newState}`
        );
      });
    }

    try {
      this._outputChannel.appendLine("Starting sqls language server...");
      await this._client.start();
      this._state = true;
      // Reset restart count on successful start
      this._restartCount = 0;
      this._outputChannel.appendLine(
        "sqls language server started successfully"
      );
    } catch (error) {
      this._state = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._outputChannel.appendLine(
        `Failed to start sqls language server: ${errorMsg}`
      );
      vscode.window.showErrorMessage(
        `sqls-next: Failed to start language server: ${errorMsg}`
      );
      throw error;
    }
  }

  async stopServer() {
    if (!this._state || !this._client) {
      this._outputChannel.appendLine("Server is not started");
      return;
    }

    try {
      await this._client.stop();
      this._outputChannel.appendLine("Server stopped successfully");
    } finally {
      this._state = false;
      this._client = undefined;
      this._outputChannel.appendLine("Server stopped");
    }
  }

  async restartServer(initializeOptions: InitializeOptions) {
    if (!this._client) {
      this._outputChannel.appendLine("Server is not initialized");
      await this.startServer(initializeOptions);
      return;
    }

    try {
      await this._client.restart();
    } catch (error) {
      this._state = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._outputChannel.appendLine(`Server restarted failed: ${errorMsg}`);
      throw error;
    }

    this._state = true;
  }

  /**
   * Execute a command on the language server and get the result
   * This is a convenience method that directly calls workspace/executeCommand
   * @param command The command identifier (e.g., "executeQuery")
   * @param args Optional arguments to pass to the command
   * @returns The result from the language server
   */
  async executeServerCommand(command: string, args?: any[]): Promise<any> {
    if (!this._client || !this._state) {
      const errorMsg = "Language server is not started";
      this._outputChannel.appendLine(`[ExecuteServerCommand] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    this._outputChannel.appendLine(
      `[ExecuteServerCommand] Executing server command: ${command}`
    );
    if (args && args.length > 0) {
      this._outputChannel.appendLine(
        `[ExecuteServerCommand] Arguments: ${JSON.stringify(args)}`
      );
    }

    try {
      // Direct call to language server via workspace/executeCommand
      const result = await this.forwardCommandToServer(command, args);

      this._outputChannel.appendLine(
        `[ExecuteServerCommand] Command executed successfully: ${command}`
      );

      // Log result
      if (result !== null && result !== undefined) {
        try {
          const resultStr = JSON.stringify(result);
          if (resultStr.length > 500) {
            this._outputChannel.appendLine(
              `[ExecuteServerCommand] Result (truncated): ${resultStr.substring(
                0,
                500
              )}...`
            );
          } else {
            this._outputChannel.appendLine(
              `[ExecuteServerCommand] Result: ${resultStr}`
            );
          }
        } catch {
          this._outputChannel.appendLine(
            `[ExecuteServerCommand] Result: [Complex Object]`
          );
        }
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._outputChannel.appendLine(
        `[ExecuteServerCommand] Error executing command ${command}: ${errorMsg}`
      );
      vscode.window.showErrorMessage(
        `Failed to execute server command ${command}: ${errorMsg}`
      );
      throw error;
    }
  }

  /**
   * Get the language client instance
   * @returns The language client or undefined if not initialized
   */
  getClient(): lsp.LanguageClient | undefined {
    return this._client;
  }

  /**
   * Check if the language server is running
   * @returns True if the server is started and ready
   */
  isServerRunning(): boolean {
    return this._state && this._client !== undefined;
  }

  async didChangeConfiguration(params: DidChangeConfigurationParams) {
    if (!this.isServerRunning()) {
      return;
    }

    await this._client?.sendNotification("workspace/didChangeConfiguration", params);
  }
}
