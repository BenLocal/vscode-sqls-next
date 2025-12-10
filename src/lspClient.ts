import path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

import * as lsp from "vscode-languageclient/node";
import {
  DidChangeConfigurationParams,
  InitializeOptions,
} from "./lspTypes";
import { ResultPanel } from "./resultPanel";
import { SqlsExecuteCommandMiddleware } from "./middleware/executeCommand";
import { MessageInterceptor, createMessageFilter } from "./messageInterceptor";
import { OutputLogger } from "./outputLogger";
import { ConnectionConfigManager } from "./database";
import { SqlsFormattingMiddleware } from "./middleware/formatting";
import { getBasePath } from "./util/platform";
import { parseResultSmart } from "./resultParser";

export class SqlsClient {
  private readonly _context: vscode.ExtensionContext;
  private readonly _resultPanel: ResultPanel | undefined;
  private readonly _messageInterceptor: MessageInterceptor;

  private _client: lsp.LanguageClient | undefined;
  private _state: boolean = false;
  private _restartCount: number = 0;
  private readonly _maxRestartAttempts: number = 5;

  constructor(context: vscode.ExtensionContext, resultPanel: ResultPanel) {
    this._context = context;
    this._resultPanel = resultPanel;

    // Initialize and activate message interceptor
    this._messageInterceptor = new MessageInterceptor({
      logMessages: true,
      // Default filter: suppress "no database connection" messages
      filter: createMessageFilter([
        "no database connection",
        "Request workspace/executeCommand failed.",
      ]),
    });

    this._messageInterceptor.activate();
  }

  private createLanguageClient(
    initializeOptions: InitializeOptions
  ): lsp.LanguageClient {
    const ext = process.platform === "win32" ? ".exe" : "";
    const perfix = process.platform === "win32" ? ".\\" : "./";
    const base = getBasePath();
    const cwd = path.join(this._context.extensionPath, "server", base);
    const sqls = `sqls${ext}`;

    // Check if sqls executable exists
    if (!fs.existsSync(path.join(cwd, sqls))) {
      const errorMsg = `sqls executable not found at: ${sqls}`;
      OutputLogger.error(errorMsg, "SqlsClient");
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
      traceOutputChannel: OutputLogger.getOutputChannel(),
      errorHandler: {
        error: (error, message, count = 0) => {
          const errorCount = count ?? 0;
          OutputLogger.error(
            `Language server error: ${error.message} (count: ${errorCount})`,
            "SqlsClient"
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
          OutputLogger.info("Language server connection closed", "SqlsClient");
          this._state = false;

          // Check if we should restart
          if (this._restartCount >= this._maxRestartAttempts) {
            OutputLogger.error(
              `Maximum restart attempts (${this._maxRestartAttempts}) reached. Server will not restart.`,
              "SqlsClient"
            );
            vscode.window.showErrorMessage(
              `sqls-next: Language server has been restarted ${this._maxRestartAttempts} times. Please check the server configuration.`
            );
            return { action: lsp.CloseAction.DoNotRestart };
          }

          this._restartCount++;
          OutputLogger.info(
            `Restarting language server (attempt ${this._restartCount}/${this._maxRestartAttempts})...`,
            "SqlsClient"
          );
          return { action: lsp.CloseAction.Restart };
        },
      },
      progressOnInitialization: true,
      initializationOptions: initializeOptions,
      initializationFailedHandler: (error) => {
        OutputLogger.error(
          `Language server initialization failed: ${error.message}`,
          "SqlsClient"
        );
        return false;
      },
      middleware: this.createMiddleware(),
    };
    return new lsp.LanguageClient(
      "sqls-next",
      "Sqls Next",
      serverOptions,
      clientOptions
    );
  }

  public getOutputChannel(): vscode.OutputChannel | undefined {
    return this._client?.outputChannel;
  }

  private createMiddleware(): lsp.Middleware {
    const execCmd = new SqlsExecuteCommandMiddleware(
      this._context,
      this._resultPanel
    );
    const fmt = new SqlsFormattingMiddleware(this._context);

    return {
      executeCommand: execCmd.executeCommand.bind(execCmd),
      provideDocumentFormattingEdits:
        fmt.provideDocumentFormattingEdits.bind(fmt),
      provideDocumentRangeFormattingEdits:
        fmt.provideDocumentRangeFormattingEdits.bind(fmt),
      provideOnTypeFormattingEdits: fmt.provideOnTypeFormattingEdits.bind(fmt),
    };
  }

  async startServer(initializeOptions: InitializeOptions) {
    if (this._state) {
      OutputLogger.info("Server is already started", "SqlsClient");
      return;
    }

    try {
      this._client ??= this.createLanguageClient(initializeOptions);
      OutputLogger.info("Starting sqls language server...", "SqlsClient");
      await this._client.start();
      this._state = true;
      // Reset restart count on successful start
      this._restartCount = 0;
      OutputLogger.info(
        "sqls language server started successfully",
        "SqlsClient"
      );
      await this.tryConnectDatabase();
    } catch (error) {
      this._state = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      OutputLogger.errorWithStackTrace(
        `Failed to start sqls language server`,
        error as Error,
        "SqlsClient"
      );
      vscode.window.showErrorMessage(
        `sqls-next: Failed to start language server: ${errorMsg}`
      );
      throw error;
    }
  }

  async stopServer() {
    if (!this._state || !this._client) {
      OutputLogger.info("Server is not started", "SqlsClient");
      return;
    }

    try {
      await this._client.stop();
      OutputLogger.info("Server stopped successfully", "SqlsClient");
    } finally {
      this._state = false;
      this._client = undefined;
    }
  }

  async restartServer(initializeOptions: InitializeOptions) {
    if (!this._client) {
      OutputLogger.info("Server is not initialized", "SqlsClient");
      await this.startServer(initializeOptions);
      return;
    }

    try {
      await this._client.restart();
      await this.tryConnectDatabase();
    } catch (error) {
      this._state = false;
      OutputLogger.errorWithStackTrace(
        `Server restarted failed`,
        error as Error,
        "SqlsClient"
      );
      throw error;
    }

    this._state = true;
  }

  private async tryConnectDatabase() {
    await this.didChangeConfiguration(true);
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
      OutputLogger.error("Language server is not started", "SqlsClient");
      throw new Error("Language server is not started");
    }

    OutputLogger.info(`Executing server command: ${command}`, "SqlsClient");
    if (args && args.length > 0) {
      OutputLogger.info(`Arguments: ${JSON.stringify(args)}`, "SqlsClient");
    }

    try {
      const result = await this._client.sendRequest(
        "workspace/executeCommand",
        {
          command: command,
          arguments: args || [],
        }
      );

      OutputLogger.info(
        `Command executed successfully: ${command}`,
        "SqlsClient"
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      OutputLogger.errorWithStackTrace(
        `Error executing command ${command}`,
        error as Error,
        "SqlsClient"
      );
      vscode.window.showErrorMessage(
        `Failed to execute server command ${command}: ${errorMsg}`
      );
      throw error;
    }
  }

  async didChangeConfiguration(switchConnection: boolean = false) {
    if (!this._state || !this._client) {
      OutputLogger.error("Server is not started", "SqlsClient");
      return;
    }

    const connectionConfigs =
      await ConnectionConfigManager.getConnectionConfigs(this._context);
    const defaultConnectionConfig = connectionConfigs.find(
      (config) => config.selected
    );
    const params: DidChangeConfigurationParams = {
      settings: {
        sqls: {
          lowercaseKeywords: false,
          connections: connectionConfigs.map((config) => {
            return {
              alias: config.config.alias,
              driver: config.config.driver as "mysql" | "sqlite3" | "postgres",
              dataSourceName: config.config.dataSourceName,
            };
          }),
        },
      },
    };
    await this._client?.sendNotification(
      "workspace/didChangeConfiguration",
      params
    );

    const selectAlias = defaultConnectionConfig?.config?.alias;
    if (switchConnection && selectAlias) {
      await this.switchConnection(selectAlias);
    }
  }

  async switchConnection(alias: string) {
    await this.executeServerCommand("switchConnections", [alias]);
  }

  async switchDatabase(database: string) {
    await this.executeServerCommand("switchDatabase", [database]);
  }

  async getDatabases(alias: string): Promise<string[]> {
    try {
      await this.switchConnection(alias);
      return await this.getCurrentDatabases();
    } finally {
      // restore the current connection
      const current = await ConnectionConfigManager.getCurrentConnectionConfig(
        this._context
      );
      const currentAlias = current?.alias;
      if (currentAlias && currentAlias !== alias) {
        await this.switchConnection(currentAlias);
      }
    }
  }

  async getTables(alias: string, database: string): Promise<string[]> {
    try {
      await this.switchConnection(alias);
      await this.switchDatabase(database);
      return await this.getCurrentTables(database);
    } finally {
      // restore the current connection
      const current = await ConnectionConfigManager.getCurrentConnectionConfig(
        this._context
      );
      const currentAlias = current?.alias;
      if (currentAlias && currentAlias !== alias) {
        await this.switchConnection(currentAlias);
      }
    }
  }

  async getCurrentDatabases(): Promise<string[]> {
    const result = await this.executeServerCommand("showDatabases");
    if (typeof result === "string") {
      return result
        .split("\n")
        .map((db) => db.trim())
        .filter((db) => db.length > 0);
    }
    return [];
  }

  async getCurrentTables(scheme: string | undefined): Promise<string[]> {
    const result = await this.executeServerCommand("showTables", scheme ? [scheme] : undefined);
    if (typeof result === "string") {
      return result
        .split("\n")
        .map((table) => {
          if (table.startsWith(`${scheme}.`)) {
            return table.substring(`${scheme}.`.length).trim();
          }
          return table.trim();
        })
        .filter((table) => table.length > 0);
    }
    return [];
  }

  async executeQuery(file: vscode.Uri, range: vscode.Range, cursorPointer: boolean = false) {
    const filePath = file.toString();
    await this._resultPanel?.displayLoading();
    const lspRange: lsp.Range = {
      start: {
        line: range.start.line,
        character: range.start.character
      } as lsp.Position,
      end: {
        line: range.end.line,
        character: range.end.character
      } as lsp.Position
    };
    const result = await this.executeServerCommand("executeQuery", [
      filePath,
      "-show-json",
      lspRange,
      cursorPointer
    ]);
    await this._resultPanel?.displayResults(parseResultSmart(result));
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._messageInterceptor.deactivate();
  }
}
