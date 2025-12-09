import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";
import { ResultPanel } from "../resultPanel";
import { parseResultSmart } from "../resultParser";
import { OutputLogger } from "../outputLogger";

export class SqlsExecuteCommandMiddleware
  implements lsp.ExecuteCommandMiddleware
{
  private readonly _context: vscode.ExtensionContext;
  private readonly _resultPanel: ResultPanel | undefined;

  constructor(
    context: vscode.ExtensionContext,
    resultPanel: ResultPanel | undefined
  ) {
    this._context = context;
    this._resultPanel = resultPanel;
  }

  async executeCommand(
    command: string,
    args: any[],
    next: lsp.ExecuteCommandSignature
  ): Promise<vscode.ProviderResult<any>> {
    OutputLogger.info(
      `Requested to execute command: ${command}`,
      "SqlsExecuteCommandMiddleware"
    );
    if (args && args.length > 0) {
      OutputLogger.info(
        `Arguments: ${JSON.stringify(args)}`,
        "SqlsExecuteCommandMiddleware"
      );
    }

    if (command === "executeQuery") {
      args[1] = "-show-json";
      await this._resultPanel?.displayLoading();
    }

    try {
      const result = await next(command, args);
      OutputLogger.info(
        `Command executed successfully via VS Code: ${command}`,
        "SqlsExecuteCommandMiddleware"
      );
      if (command === "executeQuery") {
        this._resultPanel?.displayResults(parseResultSmart(result));
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      OutputLogger.error(
        `Error executing command ${command}: ${errorMsg}`,
        "SqlsExecuteCommandMiddleware"
      );
      await this._resultPanel?.displayError(errorMsg);
    }
  }
}
