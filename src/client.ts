import path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

import * as lsp from "vscode-languageclient/node";
import { InitializeOptions } from "./initialize";

export class SqlsClient {
  private readonly _context: vscode.ExtensionContext;
  private readonly _outputChannel: vscode.OutputChannel;

  private _client: lsp.LanguageClient | undefined;
  private _state: boolean = false;
  private _restartCount: number = 0;
  private readonly _maxRestartAttempts: number = 5;

  constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this._context = context;
    this._outputChannel = outputChannel;
  }

  private createLanguageClient(initializeOptions: InitializeOptions): lsp.LanguageClient {
    const ext = process.platform === "win32" ? ".exe" : "";
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
      command: sqls,
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
      initializationOptions: initializeOptions,
      initializationFailedHandler: (error) => {
        this._outputChannel.appendLine(`Language server initialization failed: ${error.message}`);
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
              `[CodeLens] Exception: ${error instanceof Error ? error.message : String(error)}`
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
              `[CodeLens] Resolve error: ${error instanceof Error ? error.message : String(error)}`
            );
            throw error;
          }
        },
      },
    };
    return new lsp.LanguageClient(
      "sqls-next",
      "Sqls Next",
      serverOptions,
      clientOptions,
      true
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
        this._outputChannel.appendLine(`Language server state changed to: ${event.newState}`);
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
}
